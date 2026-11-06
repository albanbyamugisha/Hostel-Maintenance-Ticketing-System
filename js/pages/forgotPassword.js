import { renderAuthLayout } from '../components/authLayout.js';
export default function forgotPasswordPage() {
  renderAuthLayout({ title: 'Reset your password', subtitle: 'Contact the hostel administrator for help accessing your account.', body: `<div class="stack"><p>The administrator can set a new password for your account from People. After signing in, you can change it from your Profile page.</p><a class="btn btn--primary" href="#/login">Back to sign in</a></div>` });
}
