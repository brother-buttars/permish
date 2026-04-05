# PDF Template

The file `permission-form.pdf` must be present in this directory.

For local development, it is copied automatically from `backend/src/templates/permission-form.pdf`
by the `postinstall` script in package.json.

For Docker builds, the Dockerfile copies it during the build step.

To copy manually:
  cp ../../backend/src/templates/permission-form.pdf .
