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
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your identity, security, and global preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 1. General Profile */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm h-fit">
          <h2 className="text-lg font-semibold mb-3">General Profile</h2>
          
          <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-12 h-12 rounded-full object-cover border border-border" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-border">
                  <span className="text-sm font-bold text-primary">
                    {(profile.name || profile.email || '?')[0].toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Camera className="w-2.5 h-2.5" />
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground leading-tight">Profile Photo</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">JPEG/PNG/WebP · max 2MB</p>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">Full Name</Label>
                <Input id="name" className="h-8 text-xs" value={profile.name} onChange={(e) => handleProfileChange('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input id="email" className="h-8 text-xs" value={profile.email} onChange={(e) => handleProfileChange('email', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="income" className="text-xs">Income</Label>
                  <Input id="income" type="number" className="h-8 text-xs" value={profile.monthly_income} onChange={(e) => handleProfileChange('monthly_income', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency" className="text-xs">Currency</Label>
                  <select id="currency" value={profile.currency} onChange={(e) => handleProfileChange('currency', e.target.value)} className="w-full h-8 px-2 py-1 border rounded bg-background text-xs">
                    <option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
                    <option value="INR">INR (₹)</option><option value="CAD">CAD ($)</option><option value="AUD">AUD (A$)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone" className="text-xs">Timezone</Label>
                <select id="timezone" value={profile.timezone} onChange={(e) => handleProfileChange('timezone', e.target.value)} className="w-full h-8 px-2 py-1 border rounded bg-background text-xs">
                  <option value="Asia/Kolkata">Asia/Kolkata</option><option value="America/New_York">New York</option>
                  <option value="Europe/London">London</option><option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </div>

        {/* 2. Preferences */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm h-fit">
          <h2 className="text-lg font-semibold mb-3">Notification Preferences</h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-4 text-left">
              <div className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors">
                <Label htmlFor="pref-alerts" className="text-sm cursor-pointer">Budget Alerts</Label>
                <input id="pref-alerts" type="checkbox" checked={profile.preferences.budgetAlerts} onChange={(e) => handlePrefsChange('budgetAlerts', e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary" />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors">
                <Label htmlFor="pref-insights" className="text-sm cursor-pointer">AI Insights</Label>
                <input id="pref-insights" type="checkbox" checked={profile.preferences.aiInsights} onChange={(e) => handlePrefsChange('aiInsights', e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary" />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors">
                <Label htmlFor="pref-digest" className="text-sm cursor-pointer">Weekly Digest</Label>
                <input id="pref-digest" type="checkbox" checked={profile.preferences.weeklyDigest} onChange={(e) => handlePrefsChange('weeklyDigest', e.target.checked)} className="w-4 h-4 rounded text-primary focus:ring-primary" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Notification updates apply instantly to all your active sessions.</p>
            <Button type="submit" variant="outline" size="sm" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </form>
        </div>

        {/* 3. Formula Sheet */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm h-fit lg:row-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold">Financial System Logic</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Core metrics calculated from your spending.</p>
          <div className="space-y-4">
            {FORMULAS.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <h4 className="text-[13px] font-bold text-foreground flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-muted-foreground" /> {item.name}
                </h4>
                <div className="p-2 bg-muted/30 font-mono text-[10px] border border-border rounded text-primary">
                  {item.formula}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Security & Authentication */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm h-fit">
          <h2 className="text-lg font-semibold mb-3">Security & Access</h2>
          
          {!isGoogle ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cur-pass" className="text-xs">Current Password</Label>
                  <Input id="cur-pass" type="password" className="h-8 text-xs" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-pass" className="text-xs">New Password</Label>
                  <Input id="new-pass" type="password" className="h-8 text-xs" value={passwordForm.new} onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })} />
                </div>
              </div>
              <Button type="submit" variant="outline" size="sm" className="w-full">Update Password</Button>
            </form>
          ) : (
            <div className="bg-muted/50 p-3 rounded-xl flex gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              <p className="text-[11px] text-muted-foreground">Managed by <strong>Google</strong> authentication.</p>
            </div>
          )}

          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium">2FA PIN</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${profile.twoFactorEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {profile.twoFactorEnabled ? 'On' : 'Off'}
              </span>
            </div>
            
            {!profile.twoFactorEnabled ? (
              <form onSubmit={handle2FASubmit} className="flex gap-2">
                <Input type="password" maxLength={6} className="h-8 text-xs" placeholder="6-digit PIN" value={pinForm} onChange={(e) => setPinForm(e.target.value.replace(/\D/g, ''))} />
                <Button type="submit" size="sm">Enable</Button>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleToggle2FA(false)} className="w-full text-destructive">Disable 2FA</Button>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-sm font-medium">Active Sessions</span>
              <Button variant="ghost" size="sm" onClick={handleForceLogout} className="text-primary text-xs h-8">Revoke All</Button>
            </div>
          </div>
        </div>

        {/* 5. Data Export */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm h-fit">
          <h2 className="text-lg font-semibold mb-3">Data Management</h2>
          <p className="text-xs text-muted-foreground mb-4">Export all your spending trends and goal progress.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('json')}>
              {exporting ? '...' : 'JSON'}
            </Button>
            <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('csv')}>
              {exporting ? '...' : 'CSV'}
            </Button>
          </div>
        </div>

        {/* 6. Danger Zone */}
        <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/5 shadow-sm h-fit">
          <h2 className="text-lg font-semibold text-destructive mb-3 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Danger Zone
          </h2>
          {!showDeleteModal ? (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)} className="w-full">
              Delete Account
            </Button>
          ) : (
            <div className="space-y-3">
              <Input
                className="h-8 text-xs bg-white border-destructive/40"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
              />
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" className="flex-1" disabled={deleteConfirmText !== 'DELETE' || deleting} onClick={handleDeleteAccount}>
                  Confirm
                </Button>
                <Button variant="outline" size="sm" className="flex-1 bg-white" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
