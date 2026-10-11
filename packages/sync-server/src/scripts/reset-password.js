import { bootstrap, listLoginMethods, needsBootstrap } from '#account-db';
import { bootstrapPassword, changePassword } from '#accounts/password';
import { promptPassword } from '#util/prompt';

if (needsBootstrap()) {
  console.log(
    "It looks like you don't have a password set yet. Let's set one up now!",
  );

  try {
    const password = await promptPassword();
    const { error } = await bootstrap({ password });
    if (error) {
      console.log('Error setting password:', error);
      console.log(
        'Please report this as an issue: https://github.com/actualbudget/actual-server/issues',
      );
      process.exit(1);
    }
    console.log('Password set!');
  } catch (err) {
    console.log('Unexpected error:', err);
    console.log(
      'Please report this as an issue: https://github.com/actualbudget/actual-server/issues',
    );
    process.exit(1);
  }
} else if (!listLoginMethods().some(({ method }) => method === 'password')) {
  // A server that used the removed OpenID login has an auth row but no
  // password. Set one so the pending migration can run.
  console.log(
    "OpenID login has been removed and this server has no password. Let's set one up now!",
  );

  try {
    const password = await promptPassword();
    const { error } = await bootstrapPassword(password);
    if (error) {
      console.log('Error setting password:', error);
      process.exit(1);
    }
    console.log('Password set! Start the server to finish upgrading.');
  } catch (err) {
    console.log('Unexpected error:', err);
    process.exit(1);
  }
} else {
  console.log("It looks like you already have a password set. Let's reset it!");
  try {
    const password = await promptPassword();
    const { error } = await changePassword(password);
    if (error) {
      console.log('Error changing password:', error);
      console.log(
        'Please report this as an issue: https://github.com/actualbudget/actual-server/issues',
      );
      process.exit(1);
    }
    console.log('Password changed!');
    console.log(
      'Note: you will need to log in with the new password on any browsers or devices that are currently logged in.',
    );
  } catch (err) {
    console.log('Unexpected error:', err);
    console.log(
      'Please report this as an issue: https://github.com/actualbudget/actual-server/issues',
    );
    process.exit(1);
  }
}
