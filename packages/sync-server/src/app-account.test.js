import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

import { getAccountDb, getLoginMethod, getServerPrefs } from './account-db';
import { bootstrapPassword } from './accounts/password';
import { handlers as app, authRateLimiter } from './app-account';

const createSession = (sessionToken, authMethod = null) => {
  getAccountDb().mutate(
    'INSERT INTO sessions (token, expires_at, auth_method) VALUES (?, ?, ?)',
    [sessionToken, Math.floor(Date.now() / 1000) + 60 * 60, authMethod], // Expire in 1 hour (stored in seconds)
  );
};

const deleteSession = sessionToken => {
  getAccountDb().mutate('DELETE FROM sessions WHERE token = ?', [sessionToken]);
};

const generateSessionToken = () => `token-${uuidv4()}`;

const clearServerPrefs = () => {
  getAccountDb().mutate('DELETE FROM server_prefs');
};

const insertAuthRow = (method, active, extraData = null) => {
  getAccountDb().mutate(
    'INSERT INTO auth (method, display_name, extra_data, active) VALUES (?, ?, ?, ?)',
    [method, method, extraData, active],
  );
};

const clearAuth = () => {
  getAccountDb().mutate('DELETE FROM auth');
};

beforeEach(() => {
  authRateLimiter.resetKey('127.0.0.1');
});

describe('auth rate limiting', () => {
  it('should return 429 after exceeding the rate limit on /login', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/login').send({ password: 'wrong' });
    }

    const res = await request(app).post('/login').send({ password: 'wrong' });

    expect(res.statusCode).toEqual(429);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'too-many-requests',
    });
  });

  it('should apply the same rate limit across /login and /bootstrap', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/login').send({ password: 'wrong' });
    }

    const res = await request(app)
      .post('/bootstrap')
      .send({ password: 'test' });

    expect(res.statusCode).toEqual(429);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'too-many-requests',
    });
  });

  it('should not rate limit non-auth endpoints', async () => {
    for (let i = 0; i < 6; i++) {
      await request(app).post('/login').send({ password: 'wrong' });
    }

    const res = await request(app).get('/needs-bootstrap');
    expect(res.statusCode).toEqual(200);
  });
});

describe('/change-password', () => {
  let passwordToken, otherAuthToken;

  beforeEach(() => {
    passwordToken = generateSessionToken();
    otherAuthToken = generateSessionToken();
    createSession(passwordToken, 'password');
    createSession(otherAuthToken);
  });

  afterEach(() => {
    deleteSession(passwordToken);
    deleteSession(otherAuthToken);
    clearAuth();
  });

  it('should return 401 if no session token is provided', async () => {
    const res = await request(app).post('/change-password').send({
      password: 'newpassword',
    });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('reason', 'unauthorized');
  });

  it('should return 403 when the session did not use password auth', async () => {
    await bootstrapPassword('oldpassword');

    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', otherAuthToken)
      .send({ password: 'newpassword' });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'forbidden',
      details: 'password-auth-not-active',
    });
  });

  it('should return 400 when a password-auth session sends an empty password', async () => {
    await bootstrapPassword('oldpassword');

    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', passwordToken)
      .send({ password: '' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', reason: 'invalid-password' });
  });

  it('should return 200 when a password-auth session sends a valid password', async () => {
    await bootstrapPassword('oldpassword');

    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', passwordToken)
      .send({ password: 'newpassword' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });
  });
});

describe('getLoginMethod()', () => {
  afterEach(() => {
    clearAuth();
  });

  it('returns the active DB method when no req is provided', () => {
    insertAuthRow('password', 1);
    expect(getLoginMethod(undefined)).toBe('password');
  });

  it('honors a client-requested method that exists but is inactive in DB', () => {
    insertAuthRow('password', 0);
    const req = { body: { loginMethod: 'password' } };
    expect(getLoginMethod(req)).toBe('password');
  });

  it('ignores a client-requested method that is not in DB', () => {
    insertAuthRow('password', 1);
    const req = { body: { loginMethod: 'header' } };
    expect(getLoginMethod(req)).toBe('password');
  });

  it('falls back to config default when auth table is empty and no req', () => {
    // auth table is empty — getActiveLoginMethod() returns undefined
    // config default for loginMethod is 'password'
    expect(getLoginMethod(undefined)).toBe('password');
  });
});

describe('/login', () => {
  afterEach(() => {
    clearAuth();
  });

  it('should return a token for the correct password', async () => {
    await bootstrapPassword('testpassword');

    const res = await request(app)
      .post('/login')
      .send({ loginMethod: 'password', password: 'testpassword' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body.data).toHaveProperty('token');
  });

  it('should reject a wrong password', async () => {
    await bootstrapPassword('testpassword');

    const res = await request(app)
      .post('/login')
      .send({ loginMethod: 'password', password: 'wrongpassword' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('reason', 'invalid-password');
  });
});

describe('/server-prefs', () => {
  describe('POST /server-prefs', () => {
    let sessionToken;

    beforeEach(() => {
      sessionToken = generateSessionToken();
      createSession(sessionToken);
    });

    afterEach(() => {
      deleteSession(sessionToken);
      clearServerPrefs();
    });

    it('should return 401 if no session token is provided', async () => {
      const res = await request(app)
        .post('/server-prefs')
        .send({
          prefs: { 'flags.plugins': 'true' },
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('reason', 'unauthorized');
    });

    it('should return 400 if prefs is not an object', async () => {
      const res = await request(app)
        .post('/server-prefs')
        .set('x-actual-token', sessionToken)
        .send({
          prefs: 'invalid',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toEqual({
        status: 'error',
        reason: 'invalid-prefs',
      });
    });

    it('should return 400 if prefs is missing', async () => {
      const res = await request(app)
        .post('/server-prefs')
        .set('x-actual-token', sessionToken)
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body).toEqual({
        status: 'error',
        reason: 'invalid-prefs',
      });
    });

    it('should return 400 if prefs is null', async () => {
      const res = await request(app)
        .post('/server-prefs')
        .set('x-actual-token', sessionToken)
        .send({
          prefs: null,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toEqual({
        status: 'error',
        reason: 'invalid-prefs',
      });
    });

    it('should return 200 and save server preferences', async () => {
      const prefs = { 'flags.plugins': 'true' };

      const res = await request(app)
        .post('/server-prefs')
        .set('x-actual-token', sessionToken)
        .send({ prefs });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        status: 'ok',
        data: {},
      });

      // Verify that preferences were saved
      const savedPrefs = getServerPrefs();
      expect(savedPrefs).toEqual(prefs);
    });

    it('should update existing server preferences', async () => {
      // First, set initial preferences
      getAccountDb().mutate(
        'INSERT INTO server_prefs (key, value) VALUES (?, ?)',
        ['flags.plugins', 'false'],
      );

      // Update preferences
      const updatedPrefs = { 'flags.plugins': 'true' };
      const res = await request(app)
        .post('/server-prefs')
        .set('x-actual-token', sessionToken)
        .send({ prefs: updatedPrefs });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        status: 'ok',
        data: {},
      });

      // Verify that preferences were updated
      const savedPrefs = getServerPrefs();
      expect(savedPrefs).toEqual(updatedPrefs);
    });

    it('should save multiple server preferences', async () => {
      const prefs = {
        'flags.plugins': 'true',
        anotherKey: 'anotherValue',
      };

      const res = await request(app)
        .post('/server-prefs')
        .set('x-actual-token', sessionToken)
        .send({ prefs });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        status: 'ok',
        data: {},
      });

      // Verify that all preferences were saved
      const savedPrefs = getServerPrefs();
      expect(savedPrefs).toEqual(prefs);
    });
  });
});
