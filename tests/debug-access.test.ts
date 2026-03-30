import assert from "node:assert/strict";
import test from "node:test";
import { debugRoutesEnabled } from "../src/lib/debug-access";

// Save original env values to restore after each test
const originalNodeEnv = process.env.NODE_ENV;
const originalDebugFlag = process.env.DEBUG_ROUTES_ENABLED;
const mutableEnv = process.env as Record<string, string | undefined>;

function restoreEnv() {
  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }
  if (originalDebugFlag === undefined) {
    delete mutableEnv.DEBUG_ROUTES_ENABLED;
  } else {
    mutableEnv.DEBUG_ROUTES_ENABLED = originalDebugFlag;
  }
}

test("debugRoutesEnabled: returns true in non-production environment", () => {
  mutableEnv.NODE_ENV = "development";
  delete mutableEnv.DEBUG_ROUTES_ENABLED;
  try {
    assert.equal(debugRoutesEnabled(), true);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns true in test environment", () => {
  mutableEnv.NODE_ENV = "test";
  delete mutableEnv.DEBUG_ROUTES_ENABLED;
  try {
    assert.equal(debugRoutesEnabled(), true);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns false in production without DEBUG_ROUTES_ENABLED", () => {
  mutableEnv.NODE_ENV = "production";
  delete mutableEnv.DEBUG_ROUTES_ENABLED;
  try {
    assert.equal(debugRoutesEnabled(), false);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns true in production with DEBUG_ROUTES_ENABLED=true", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.DEBUG_ROUTES_ENABLED = "true";
  try {
    assert.equal(debugRoutesEnabled(), true);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns false in production with DEBUG_ROUTES_ENABLED=false", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.DEBUG_ROUTES_ENABLED = "false";
  try {
    assert.equal(debugRoutesEnabled(), false);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns false in production with DEBUG_ROUTES_ENABLED set to empty string", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.DEBUG_ROUTES_ENABLED = "";
  try {
    assert.equal(debugRoutesEnabled(), false);
  } finally {
    restoreEnv();
  }
});
