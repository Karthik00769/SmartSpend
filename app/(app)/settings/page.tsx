/**
 * app/(app)/settings/page.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Fully functional settings page with Profile, Password, 2FA,
 * Preferences, Force Logout, and Delete Account features.
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { apiGet, apiPost } from '@/lib/api-client';
import { toast } from 'sonner';
import { AlertCircle, ShieldCheck, Trash2, LogOut, Camera, Calculator, Info } from 'lucide-react';
import { useSmartSpend } from '@/context/smartspend-context';
import { refreshCurrency } from '@/hooks/use-currency';
import { notifyAvatarRefresh } from '@/hooks/use-avatar';
import { FORMULAS } from '@/lib/constants/formulas';

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const { refreshAll } = useSmartSpend();

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    monthly_income: 0,
    currency: 'USD',
    timezone: 'Asia/Kolkata',
    twoFactorEnabled: false,
    preferences: {
      budgetAlerts: true,
      aiInsights: true,
      weeklyDigest: false,
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Avatar upload state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Fetch full profile from API
  const loadProfile = async () => {
    try {
      const data = await apiGet<any>('/api/settings/profile');
      setProfile({
        name: data.name || '',
        email: data.email || '',
        monthly_income: data.monthly_income || 0,
        currency: data.currency || 'USD',
        timezone: data.timezone || 'Asia/Kolkata',
        twoFactorEnabled: data.twoFactorEnabled || false,
        preferences: data.preferences || {
          budgetAlerts: true,
          aiInsights: true,
          weeklyDigest: false,
        },
      });
      setAvatarUrl(data.avatar_url || null);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      toast.error('Could not load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      loadProfile();
    }
  }, [session]);

  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  const [pinForm, setPinForm] = useState('');

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await fetch('/api/settings/avatar', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      const url = (json.data ?? json).avatarUrl;
      setAvatarUrl(url);
      notifyAvatarRefresh();
      toast.success('Profile photo updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload photo');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleProfileChange = (field: string, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handlePrefsChange = (field: string, checked: boolean) => {
    setProfile(prev => ({
      ...prev,
      preferences: { ...prev.preferences, [field]: checked },
    }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/api/settings/profile', {
        name: profile.name,
        email: profile.email,
        monthly_income: profile.monthly_income,
        currency: profile.currency,
        timezone: profile.timezone,
        preferences: profile.preferences,
      });

      toast.success('Settings saved — dashboard is refreshing.');

      // Refresh all context data so dashboard/insights/budgets/goals
      // immediately reflect the new monthly_income and currency
      refreshAll();
      // Re-fetch currency in all useCurrency() instances across the app
      refreshCurrency();

      // Update local session if name/email changed
      if (profile.name !== session?.user?.name || profile.email !== session?.user?.email) {
        await updateSession({ name: profile.name, email: profile.email });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.current || !passwordForm.new) {
      toast.error('All password fields are required');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      await apiPost('/api/settings/password', {
        current: passwordForm.current,
        new: passwordForm.new,
      });
      toast.success('Password updated successfully!');
      setPasswordForm({ current: '', new: '', confirm: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinForm.length !== 6) {
      toast.error('PIN must be exactly 6 digits');
      return;
    }
    try {
      await apiPost('/api/settings/2fa', { pin: pinForm });
      toast.success('2FA PIN configured!');
      setProfile(prev => ({ ...prev, twoFactorEnabled: true }));
      setPinForm('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to setup 2FA');
    }
  };

  const handleToggle2FA = async (enable: boolean) => {
    if (!enable) {
      try {
        await apiPost('/api/settings/2fa', { pin: null });
        toast.success('2FA disabled');
        setProfile(prev => ({ ...prev, twoFactorEnabled: false }));
      } catch (err: any) {
        toast.error('Failed to disable 2FA');
      }
    }
  };

  const handleForceLogout = async () => {
    if (!confirm('Force logout all devices? You will stay logged in on this device, but other sessions will eventually expire.')) return;
    try {
      await apiPost('/api/settings/force-logout', {});
      toast.success('Force logout signal sent to all devices.');
    } catch (err: any) {
      toast.error('Failed to force logout.');
    }
  };

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteModal,   setShowDeleteModal]   = useState(false);
  const [deleting,          setDeleting]          = useState(false);
  const [exporting,         setExporting]         = useState(false);

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/settings/export?format=${format}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `smartspend-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Data exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      await apiPost('/api/settings/delete-account', {});
      toast.success('Account deleted. Logging you out…');
      setTimeout(() => signOut({ callbackUrl: '/' }), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="h-64 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const isGoogle = session?.user?.image?.includes('googleusercontent');

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Account Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your identity, security, and global preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profile and Preferences (Unified for logical flow) */}
        <Card className="p-6 h-fit">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-xl font-bold text-foreground">General Profile</h2>
          </div>

          {/* Avatar upload */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile photo"
                  className="w-16 h-16 rounded-full object-cover border-2 border-border" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border-2 border-border">
                  <span className="text-xl font-bold text-primary">
                    {(profile.name || profile.email || '?')[0].toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground
                  flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="Change photo"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Profile Photo</p>
              <p className="text-xs text-muted-foreground mb-2">JPEG, PNG, WebP or GIF · max 2 MB</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarUploading ? 'Uploading…' : 'Change Photo'}
              </Button>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) => handleProfileChange('name', e.target.value)}
                  placeholder="Enter your name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  value={profile.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="income">Monthly Income</Label>
                  <Input
                    id="income"
                    type="number"
                    value={profile.monthly_income}
                    onChange={(e) => handleProfileChange('monthly_income', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <select
                    id="currency"
                    value={profile.currency}
                    onChange={(e) => handleProfileChange('currency', e.target.value)}
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background text-foreground text-sm"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="JPY">JPY (¥)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  value={profile.timezone}
                  onChange={(e) => handleProfileChange('timezone', e.target.value)}
                  className="w-full h-10 px-3 py-2 border rounded-md bg-background text-foreground text-sm"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</option>
                  <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                  <option value="UTC">UTC</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Dates and times will be displayed in this timezone.
                </p>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold text-foreground mb-4">Notification Preferences</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pref-alerts" className="cursor-pointer">Budget Alerts</Label>
                  <input
                    id="pref-alerts"
                    type="checkbox"
                    checked={profile.preferences.budgetAlerts}
                    onChange={(e) => handlePrefsChange('budgetAlerts', e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pref-insights" className="cursor-pointer">AI Financial Insights</Label>
                  <input
                    id="pref-insights"
                    type="checkbox"
                    checked={profile.preferences.aiInsights}
                    onChange={(e) => handlePrefsChange('aiInsights', e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pref-digest" className="cursor-pointer">Weekly Digest</Label>
                  <input
                    id="pref-digest"
                    type="checkbox"
                    checked={profile.preferences.weeklyDigest}
                    onChange={(e) => handlePrefsChange('weeklyDigest', e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Updating...' : 'Save All General Settings'}
            </Button>
          </form>
        </Card>

        {/* Financial Logic Explained */}
        <Card className="p-6 h-fit bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-background border-indigo-100 dark:border-indigo-900/50">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="w-5 h-5 text-indigo-500" />
            <h2 className="text-xl font-bold text-foreground">Financial System Logic</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            SmartSpend calculates your metrics using real-world financial principles. Here is the exact logic behind your dashboard.
          </p>

          <div className="space-y-6">
            {FORMULAS.map((item, idx) => (
              <div key={idx} className="group">
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-md text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h4 className="font-semibold text-sm text-foreground">{item.name}</h4>
                    <div className="inline-block px-2 py-1 bg-white dark:bg-muted font-mono text-[11px] border border-indigo-100 dark:border-indigo-800 rounded text-indigo-700 dark:text-indigo-300">
                      {item.formula}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.explanation}
                    </p>
                    <div className="text-[10px] italic text-indigo-500/80 dark:text-indigo-400/80">
                      Example: {item.example}
                    </div>
                  </div>
                </div>
                {idx < FORMULAS.length - 1 && <div className="ml-8 mt-6 border-b border-border/50" />}
              </div>
            ))}
          </div>
        </Card>

        {/* Security & Access */}
        <div className="space-y-8">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-6">Security & Authentication</h2>
            
            {/* Password section */}
            {!isGoogle ? (
              <form onSubmit={handlePasswordSubmit} className="space-y-4 mb-8">
                <div className="space-y-2">
                  <Label htmlFor="cur-pass">Current Password</Label>
                  <Input
                    id="cur-pass"
                    type="password"
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-pass">New Password</Label>
                    <Input
                      id="new-pass"
                      type="password"
                      value={passwordForm.new}
                      onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="con-pass">Confirm</Label>
                    <Input
                      id="con-pass"
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline" className="w-full">Change Password</Button>
              </form>
            ) : (
              <div className="bg-muted p-4 rounded-lg mb-8 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-indigo-500 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  You are logged in via <strong>Google</strong>. Account management is handled by Google for your security.
                </p>
              </div>
            )}

            {/* 2FA Section */}
            <div className="border-t pt-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <span className="font-semibold text-foreground">2FA PIN Access</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${profile.twoFactorEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                   {profile.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {!profile.twoFactorEnabled ? (
                <form onSubmit={handle2FASubmit} className="space-y-3">
                  <p className="text-xs text-muted-foreground mb-2">Setup a 6-digit PIN required for extra protection.</p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      maxLength={6}
                      placeholder="6-digit PIN"
                      value={pinForm}
                      onChange={(e) => setPinForm(e.target.value.replace(/\D/g, ''))}
                    />
                    <Button type="submit" size="sm">Enable</Button>
                  </div>
                </form>
              ) : (
                <Button variant="outline" onClick={() => handleToggle2FA(false)} className="w-full text-destructive border-destructive/20 hover:bg-destructive/5">
                  Disable 2FA PIN
                </Button>
              )}
            </div>

            {/* Force Logout */}
            <div className="border-t pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <LogOut className="w-5 h-5 text-indigo-400" />
                    Force Logout
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Invalidates all other active sessions globally.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleForceLogout}>Revoke All</Button>
              </div>
            </div>
          </Card>

          {/* Export data */}
          <Card className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-2">Export Your Data</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Download a full copy of your SmartSpend data. Includes expenses, budgets, goals, and insights.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" disabled={exporting}
                onClick={() => handleExport('json')}>
                {exporting ? 'Exporting…' : '⬇️ Export JSON'}
              </Button>
              <Button variant="outline" className="flex-1" disabled={exporting}
                onClick={() => handleExport('csv')}>
                {exporting ? 'Exporting…' : '⬇️ Export CSV'}
              </Button>
            </div>
          </Card>

          {/* Danger zone */}
          <Card className="p-6 border-destructive/20 bg-destructive/5">
            <h2 className="text-xl font-bold text-destructive mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Danger Zone
            </h2>
            <p className="text-sm text-destructive/80 mb-4">
              Account deletion is permanent and irreversible. All your expenses, budgets, goals, and insights will be permanently removed.
            </p>

            {!showDeleteModal ? (
              <Button variant="destructive" onClick={() => setShowDeleteModal(true)}
                className="w-full shadow-lg shadow-destructive/20">
                Permanently Delete Account
              </Button>
            ) : (
              <div className="space-y-4 border border-destructive/30 rounded-lg p-4 bg-destructive/10">
                <p className="text-sm font-semibold text-destructive">
                  Type <span className="font-mono bg-destructive/20 px-1 rounded">DELETE</span> to confirm:
                </p>
                <Input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="border-destructive/40 focus:border-destructive"
                  autoComplete="off"
                />
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteConfirmText !== 'DELETE' || deleting}
                    onClick={handleDeleteAccount}
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </Button>
                  <Button variant="outline" className="flex-1"
                    onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
