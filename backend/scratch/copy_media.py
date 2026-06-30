import shutil
from pathlib import Path

def main():
    brain_dir = Path("/home/drdo/.gemini/antigravity/brain/781f0e26-1672-4dcf-89a5-85465582871b")
    artifacts_dir = brain_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    
    # Paths to copy
    field_screenshot = brain_dir / ".system_generated/click_feedback/click_feedback_1782385738370.png"
    mesh_screenshot = brain_dir / ".system_generated/click_feedback/click_feedback_1782385797339.png"
    recording = brain_dir / "verify_visualizations_1782385597705.webp"
    
    # Dest paths
    dest_field = artifacts_dir / "field_verification.png"
    dest_mesh = artifacts_dir / "mesh_verification.png"
    dest_rec = artifacts_dir / "verify_visualizations.webp"
    
    # Copy
    if field_screenshot.exists():
        shutil.copy2(field_screenshot, dest_field)
        print(f"Copied field screenshot to {dest_field}")
    if mesh_screenshot.exists():
        shutil.copy2(mesh_screenshot, dest_mesh)
        print(f"Copied mesh screenshot to {dest_mesh}")
    if recording.exists():
        shutil.copy2(recording, dest_rec)
        print(f"Copied recording to {dest_rec}")

if __name__ == "__main__":
    main()
