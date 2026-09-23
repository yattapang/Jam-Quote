// reflect-metadata must be loaded before any decorator runs. Imported once here and
// wired into vitest's setupFiles, rather than at the top of each file, so a new test
// cannot silently forget it and see undefined metadata.
import "reflect-metadata";
