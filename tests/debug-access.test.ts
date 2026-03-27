import assert from "node:assert/strict";
import test from "node:test";
import { debugRoutesEnabled } from "../src/lib/debug-access";

// Save original env values to restore after each test
const originalNodeEnv = process.env.NODE_ENV;
const originalDebugFlag = process.env.DEBUG_ROUTES_ENABLED;

function restoreEnv() {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalDebugFlag === undefined) {
    delete process.env.DEBUG_ROUTES_ENABLED;
  } else {
    process.env.DEBUG_ROUTES_ENABLED = originalDebugFlag;
  }
}

test("debugRoutesEnabled: returns true in non-production environment", () => {
  process.env.NODE_ENV = "development";
  delete process.env.DEBUG_ROUTES_ENABLED;
  try {
    assert.equal(debugRoutesEnabled(), true);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns true in test environment", () => {
  process.env.NODE_ENV = "test";
  delete process.env.DEBUG_ROUTES_ENABLED;
  try {
    assert.equal(debugRoutesEnabled(), true);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns false in production without DEBUG_ROUTES_ENABLED", () => {
  process.env.NODE_ENV = "production";
  delete process.env.DEBUG_ROUTES_ENABLED;
  try {
    assert.equal(debugRoutesEnabled(), false);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns true in production with DEBUG_ROUTES_ENABLED=true", () => {
  process.env.NODE_ENV = "production";
  process.env.DEBUG_ROUTES_ENABLED = "true";
  try {
    assert.equal(debugRoutesEnabled(), true);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns false in production with DEBUG_ROUTES_ENABLED=false", () => {
  process.env.NODE_ENV = "production";
  process.env.DEBUG_ROUTES_ENABLED = "false";
  try {
    assert.equal(debugRoutesEnabled(), false);
  } finally {
    restoreEnv();
  }
});

test("debugRoutesEnabled: returns false in production with DEBUG_ROUTES_ENABLED set to empty string", () => {
  process.env.NODE_ENV = "production";
  process.env.DEBUG_ROUTES_ENABLED = "";
  try {
    assert.equal(debugRoutesEnabled(), false);
  } finally {
    restoreEnv();
  }
});
