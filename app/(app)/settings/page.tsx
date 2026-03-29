'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { apiGet, apiPost } from '@/lib/api-client';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    monthly_income: 0,
    currency: 'USD',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch profile from API
  useEffect(() => {
    apiGet<any>('/api/settings/profile')
      .then(data => {
        setProfile({
          name: data.name || '',
          email: data.email || '',
          monthly_income: data.monthly_income || 0,
          currency: data.currency || 'USD',
        });
      })
      .catch(err => {
        console.error('Failed to load profile:', err);
        // Fallback to session if API fails
        if (session?.user) {
          setProfile(prev => ({
            ...prev,
            name: session.user?.name || '',
            email: session.user?.email || '',
          }));
        }
      })
      .finally(() => setLoading(false));
  }, [session]);

  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  const handleProfileChange = (field: string, value: string | number) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiPost('/api/settings/profile', profile);
      toast.success('Profile updated successfully!');
      // Update session if name changed
      if (profile.name !== session?.user?.name) {
        await updateSession({ name: profile.name });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    // Security logic would go here
    toast.info('Password change is handled via identity provider for Google users.');
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-muted rounded-xl w-1/3 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="h-96 bg-muted rounded-xl" />
          <div className="h-96 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account and financial preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profile Settings */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-6">Profile Settings</h2>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => handleProfileChange('name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="opacity-70 cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthly_income">Monthly Income ($)</Label>
              <Input
                id="monthly_income"
                type="number"
                value={profile.monthly_income}
                onChange={(e) => handleProfileChange('monthly_income', parseFloat(e.target.value) || 0)}
                placeholder="e.g. 5000"
              />
              <p className="text-xs text-muted-foreground">Used to calculate savings rate and goal probability.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Preferred Currency</Label>
              <select
                id="currency"
                value={profile.currency}
                onChange={(e) => handleProfileChange('currency', e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </Card>

        {/* Security Settings */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-6">Security & Password</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={passwordForm.current}
                onChange={(e) => handlePasswordChange('current', e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordForm.new}
                onChange={(e) => handlePasswordChange('new', e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => handlePasswordChange('confirm', e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" variant="outline" className="w-full">
              Update Password
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Note: If you signed in with Google, you should manage your password via your Google Account.
            </p>
          </form>
        </Card>

        {/* Notification Settings */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-6">Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Budget Alerts</label>
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">AI Spending Insights</label>
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Weekly Digest</label>
              <input type="checkbox" className="w-5 h-5 accent-primary" />
            </div>

            <Button type="button" variant="outline" className="w-full">
              Save Preferences
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-6 border-destructive/20 bg-destructive/5">
          <h2 className="text-xl font-bold text-destructive mb-6">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Permanently delete your account and all financial data. There is no undo.
          </p>
          <Button variant="destructive" className="w-full">
            Delete My Account
          </Button>
        </Card>
      </div>
    </div>
  );
}
