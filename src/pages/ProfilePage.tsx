import { type ChangeEvent, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneInput } from '@/components/PhoneInput';
import { toast } from 'sonner';
import { Loader2, User as UserIcon, Lock, Mail, Phone, IdCard, Camera } from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, refreshProfile, role } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nid, setNid] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '+880');
      setNid(profile.nid_card || '');
      setAvatarUrl(profile.avatar_url || '');
    }
    if (user) setEmail(user.email || '');
  }, [profile, user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        nid_card: nid.trim() || null,
      } as any)
      .eq('id', user.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Profile updated');
      refreshProfile();
    }
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('শুধুমাত্র image file upload করুন');
      return;
    }
    if (file.size > 10 * 1024) {
      toast.error('ছবির size সর্বোচ্চ 10 KB হতে পারবে');
      return;
    }

    setSavingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: dataUrl } as any)
        .eq('id', user.id);
      setSavingPhoto(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAvatarUrl(dataUrl);
      toast.success('Profile photo updated');
      refreshProfile();
    };
    reader.onerror = () => {
      setSavingPhoto(false);
      toast.error('ছবি upload করা যায়নি');
    };
    reader.readAsDataURL(file);
  };

  const handleChangeEmail = async () => {
    if (!email.trim()) {
      toast.error('Enter a valid email');
      return;
    }
    setSavingEmail(true);
    const { data, error } = await supabase.functions.invoke('update-user-email', {
      body: { email: email.trim() },
    });
    setSavingEmail(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Email update failed');
    } else {
      await supabase.auth.refreshSession();
      toast.success('Email updated successfully');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">{role || 'member'} account</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="w-4 h-4" /> Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden text-xl font-bold text-primary shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
              ) : (
                fullName?.charAt(0)?.toUpperCase() || 'U'
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-photo" className="text-sm font-medium">Profile Photo</Label>
              <div>
                <Button type="button" variant="outline" size="sm" disabled={savingPhoto} asChild>
                  <label htmlFor="profile-photo" className="cursor-pointer">
                    {savingPhoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                    Upload Photo
                  </label>
                </Button>
                <Input id="profile-photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </div>
              <p className="text-xs text-muted-foreground">Maximum image size: 10 KB.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Phone Number</Label>
            <PhoneInput value={phone} onChange={setPhone} />
            <p className="text-xs text-muted-foreground">Country code +880 is added automatically. Delete it to use a different country.</p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><IdCard className="w-3.5 h-3.5" /> NID Card Number</Label>
            <Input value={nid} onChange={e => setNid(e.target.value)} placeholder="National ID number" />
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="w-4 h-4" /> Email Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">Deleted account-এর email হলে সেটি পরিষ্কার করে এই account-এ সেট হবে।</p>
          </div>
          <Button onClick={handleChangeEmail} disabled={savingEmail} variant="outline">
            {savingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Update Email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Lock className="w-4 h-4" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
          </div>
          <Button onClick={handleChangePassword} disabled={savingPassword} variant="outline">
            {savingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Update Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
