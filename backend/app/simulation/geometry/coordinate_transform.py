"""Coordinate transformation utilities for the simulation geometry builder."""

from __future__ import annotations

import math
from typing import Tuple


def rotate_point(
    x: float, 
    y: float, 
    angle_deg: float, 
    origin: Tuple[float, float] = (0.0, 0.0)
) -> Tuple[float, float]:
    """Rotate a 2D point around an origin by an angle in degrees.
    
    Args:
        x: The X coordinate.
        y: The Y coordinate.
        angle_deg: Rotation angle in degrees (counter-clockwise).
        origin: The pivot point of rotation.
        
    Returns:
        A tuple of rotated (x, y) coordinates.
    """
    if angle_deg == 0.0:
        return x, y
        
    angle_rad = math.radians(angle_deg)
    cos_val = math.cos(angle_rad)
    sin_val = math.sin(angle_rad)
    
    # Translate to origin
    ox, oy = origin
    tx = x - ox
    ty = y - oy
    
    # Rotate
    rx = tx * cos_val - ty * sin_val
    ry = tx * sin_val + ty * cos_val
    
    # Translate back
    return rx + ox, ry + oy


def local_to_global(
    local_x: float,
    local_y: float,
    global_dx: float,
    global_dy: float,
    rotation_deg: float,
) -> Tuple[float, float]:
    """Transform a local component coordinate into global space.
    
    The local point is first rotated around (0, 0) by rotation_deg and then 
    translated by (global_dx, global_dy).
    
    Args:
        local_x: Local X coordinate of the point.
        local_y: Local Y coordinate of the point.
        global_dx: Global X placement coordinate.
        global_dy: Global Y placement coordinate.
        rotation_deg: Placement rotation in degrees.
        
    Returns:
        A tuple of global (x, y) coordinates.
    """
    # Rotate around (0, 0)
    rx, ry = rotate_point(local_x, local_y, rotation_deg, origin=(0.0, 0.0))
    # Translate to global position
    return rx + global_dx, ry + global_dy


def transform_bounding_box(
    local_bbox: Tuple[float, float, float, float],
    global_dx: float,
    global_dy: float,
    rotation_deg: float,
) -> Tuple[float, float, float, float]:
    """Calculate the global axis-aligned bounding box of a placed component.
    
    This extracts the 4 corners of the local bounding box, transforms all 4 
    corners to global coordinates, and finds the bounding box of the resulting polygon.
    
    Args:
        local_bbox: Tuple of (xmin, ymin, xmax, ymax) in local coordinates.
        global_dx: Global X placement coordinate.
        global_dy: Global Y placement coordinate.
        rotation_deg: Placement rotation in degrees.
        
    Returns:
        A tuple of global (xmin, ymin, xmax, ymax) coordinates.
    """
    lx_min, ly_min, lx_max, ly_max = local_bbox
    
    # Define 4 corners in local space
    corners = [
        (lx_min, ly_min),
        (lx_min, ly_max),
        (lx_max, ly_min),
        (lx_max, ly_max),
    ]
    
    # Transform all corners to global space
    global_corners = [
        local_to_global(cx, cy, global_dx, global_dy, rotation_deg)
        for cx, cy in corners
    ]
    
    # Extract min/max from global corners
    gx_coords = [cx for cx, _ in global_corners]
    gy_coords = [cy for _, cy in global_corners]
    
    return min(gx_coords), min(gy_coords), max(gx_coords), max(gy_coords)


def simplify_path(
    points: list[Tuple[float, float]], 
    tolerance: float = 0.002
) -> list[Tuple[float, float]]:
    """Simplify a 2D path using the Ramer-Douglas-Peucker algorithm.
    
    Args:
        points: List of 2D points (x, y) representing the path (in mm).
        tolerance: Distance threshold for filtering points (in mm).
            Default is 0.002 mm (2 microns) — tight enough to preserve all
            meander resonator turns while removing sub-micron SVG rendering
            noise. The previous default of 0.02 mm (20 microns) was
            discarding individual meander turns, shortening resonators by up
            to 40% and pushing all eigenfrequencies 40-60% too high.
        
    Returns:
        A list of simplified 2D points.
    """
    if len(points) <= 2:
        return points

    def distance_point_to_segment(p: Tuple[float, float], s1: Tuple[float, float], s2: Tuple[float, float]) -> float:
        x, y = p
        x1, y1 = s1
        x2, y2 = s2
        dx = x2 - x1
        dy = y2 - y1
        l2 = dx*dx + dy*dy
        if l2 == 0:
            return math.sqrt((x - x1)**2 + (y - y1)**2)
        t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / l2))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy
        return math.sqrt((x - proj_x)**2 + (y - proj_y)**2)

    dmax = 0.0
    index = 0
    end = len(points) - 1
    for i in range(1, end):
        d = distance_point_to_segment(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d

    if dmax > tolerance:
        results1 = simplify_path(points[:index+1], tolerance)
        results2 = simplify_path(points[index:], tolerance)
        return results1[:-1] + results2
    else:
        return [points[0], points[end]]

