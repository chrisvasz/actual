import express from 'express';

import { SecretName, secretsService } from './services/secrets-service';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from './util/middlewares';
import { isValidFileId } from './util/paths';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

app.post('/', async (req, res) => {
  const { name, value } = req.body || {};
  const fileId = req.get('X-Actual-File-Id');
  const perBudgetFile = fileId != null;

  if (!(name in SecretName)) {
    res.status(400).send({
      status: 'error',
      reason: 'invalid-secret-name',
      details: 'Unknown secret name',
    });
    return;
  }

  if (perBudgetFile) {
    if (!isValidFileId(fileId)) {
      res.status(400).send({
        status: 'error',
        reason: 'invalid-file-id',
        details: 'invalid fileId',
      });
      return;
    }
  }

  const secretFileId = perBudgetFile ? fileId : null;
  secretsService.set(name, value, secretFileId);

  res.status(200).send({ status: 'ok' });
});

app.delete('/:name', async (req, res) => {
  const name = req.params.name;
  const fileId = req.get('X-Actual-File-Id');
  const perBudgetFile = fileId != null;

  if (!(name in SecretName)) {
    res.status(404).send('key not found');
    return;
  }

  if (!perBudgetFile) {
    secretsService.reset(name);
    res.status(200).send({ status: 'ok' });
    return;
  }

  if (!isValidFileId(fileId)) {
    res.status(400).send({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'invalid fileId',
    });
    return;
  }

  secretsService.reset(name, fileId);
  res.status(200).send({ status: 'ok' });
});

app.get('/:name', async (req, res) => {
  const name = req.params.name;
  const fileId = req.get('X-Actual-File-Id');
  const perBudgetFile = fileId != null;

  if (!(name in SecretName)) {
    res.status(404).send('key not found');
    return;
  }

  if (perBudgetFile && !isValidFileId(fileId)) {
    res.status(400).send({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'invalid fileId',
    });
    return;
  }

  const keyExists = secretsService.exists(name, perBudgetFile ? fileId : null);
  if (keyExists) {
    res.sendStatus(204);
  } else {
    res.status(404).send('key not found');
  }
});
