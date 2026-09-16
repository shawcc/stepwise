import { strict as assert } from "node:assert";
import {
  privateAccessCookie,
  privateAccessState,
  verifyPrivateAccessCode,
} from "../api/_access";

const previousVercelEnvironment = process.env.VERCEL_ENV;
const previousAccessCode = process.env.STEPWISE_ACCESS_CODE;

try {
  process.env.VERCEL_ENV = "production";
  delete process.env.STEPWISE_ACCESS_CODE;
  assert.equal(privateAccessState({ headers: {} }), "unconfigured");

  process.env.STEPWISE_ACCESS_CODE = "test-only-long-private-access-code";
  assert.equal(privateAccessState({ headers: {} }), "unauthorized");
  assert.equal(verifyPrivateAccessCode("wrong-code"), false);
  assert.equal(
    privateAccessState({
      headers: {
        authorization: "Bearer test-only-long-private-access-code",
      },
    }),
    "authorized",
  );

  const cookie = privateAccessCookie().split(";")[0];
  assert.equal(
    privateAccessState({ headers: { cookie } }),
    "authorized",
  );
} finally {
  if (previousVercelEnvironment === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = previousVercelEnvironment;
  }
  if (previousAccessCode === undefined) {
    delete process.env.STEPWISE_ACCESS_CODE;
  } else {
    process.env.STEPWISE_ACCESS_CODE = previousAccessCode;
  }
}

console.log(
  JSON.stringify({
    productionFailsClosed: true,
    invalidCodeRejected: true,
    bearerAuthorized: true,
    cookieAuthorized: true,
  }),
);
