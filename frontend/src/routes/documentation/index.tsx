import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/documentation/")({
  beforeLoad: () => {
    // Already on documentation, do not redirect to missing home route
  },
});
