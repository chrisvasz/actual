import express from 'express';
import rateLimit from 'express-rate-limit';

import {
  bootstrap,
  getLoginMethod,
  getServerPrefs,
  listLoginMethods,
  needsBootstrap,
  setServerPrefs,
} from './account-db';
import { changePassword, loginWithPassword } from './accounts/password';
import { errorMiddleware, requestLoggerMiddleware } from './util/middlewares';
import { validateAuthHeader, validateSession } from './util/validate-user';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(errorMiddleware);
app.use(requestLoggerMiddleware);

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  legacyHeaders: false,
  standardHeaders: true,
  skipSuccessfulRequests: true,
  message: { status: 'error', reason: 'too-many-requests' },
});

export { app as handlers, authRateLimiter };

// Non-authenticated endpoints:
//
// /needs-bootstrap
// /boostrap (special endpoint for setting up the instance, cant call again)
// /login

app.get('/needs-bootstrap', (req, res) => {
  const availableLoginMethods = listLoginMethods();
  res.send({
    status: 'ok',
    data: {
      bootstrapped: !needsBootstrap(),
      loginMethod:
        availableLoginMethods.length === 1
          ? availableLoginMethods[0].method
          : getLoginMethod(),
      availableLoginMethods,
    },
  });
});

app.post('/bootstrap', authRateLimiter, async (req, res) => {
  const boot = await bootstrap(req.body);

  if (boot?.error) {
    res.status(400).send({ status: 'error', reason: boot?.error });
    return;
  }
  res.send({ status: 'ok', data: boot });
});

app.get('/login-methods', (req, res) => {
  const methods = listLoginMethods();
  res.send({ status: 'ok', methods });
});

app.post('/login', authRateLimiter, async (req, res) => {
  const loginMethod = getLoginMethod(req);
  console.log('Logging in via ' + loginMethod);
  let tokenRes = null;
  switch (loginMethod) {
    case 'header': {
      const headerVal = req.get('x-actual-password') || '';
      const obfuscated =
        '*'.repeat(headerVal.length) || 'No password provided.';
      console.debug('HEADER VALUE: ' + obfuscated);
      if (headerVal === '') {
        res.send({ status: 'error', reason: 'invalid-header' });
        return;
      } else {
        if (validateAuthHeader(req)) {
          tokenRes = await loginWithPassword(headerVal);
        } else {
          res.send({ status: 'error', reason: 'proxy-not-trusted' });
          return;
        }
      }
      break;
    }
    default:
      tokenRes = await loginWithPassword(req.body.password);
      break;
  }
  const { error, token } = tokenRes;

  if (error) {
    res.status(400).send({ status: 'error', reason: error });
    return;
  }

  res.send({ status: 'ok', data: { token } });
});

app.post('/change-password', async (req, res) => {
  const session = validateSession(req, res);
  if (!session) return;

  if (session.auth_method !== 'password') {
    res.status(403).send({
      status: 'error',
      reason: 'forbidden',
      details: 'password-auth-not-active',
    });
    return;
  }

  const { error } = await changePassword(req.body.password);

  if (error) {
    res.status(400).send({ status: 'error', reason: error });
    return;
  }

  res.send({ status: 'ok', data: {} });
});

app.post('/server-prefs', (req, res) => {
  const session = validateSession(req, res);
  if (!session) return;

  const { prefs } = req.body || {};

  if (!prefs || typeof prefs !== 'object') {
    res.status(400).send({ status: 'error', reason: 'invalid-prefs' });
    return;
  }

  setServerPrefs(prefs);

  res.send({ status: 'ok', data: {} });
});

app.get('/validate', (req, res) => {
  const session = validateSession(req, res);
  if (session) {
    res.send({
      status: 'ok',
      data: {
        validated: true,
        loginMethod: session.auth_method,
        prefs: getServerPrefs(),
      },
    });
  }
});
