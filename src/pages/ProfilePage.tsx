import { type ChangeEvent, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneInput } from '@/components/PhoneInput';
import { ImageCropperDialog } from '@/components/ImageCropperDialog';
import { toast } from 'sonner';
import { Loader2, User as UserIcon, Lock, Mail, Phone, IdCard, Camera, Trash2 } from 'lucide-react';

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
  const [cropSrc, setCropSrc] = useState<string | null>(null);


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

  const compressImage = (file: File, maxBytes: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          const maxDim = 512;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          let quality = 0.9;
          let dataUrl = '';
          for (let i = 0; i < 10; i++) {
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas not supported'));
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            const bytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
            if (bytes <= maxBytes) return resolve(dataUrl);
            if (quality > 0.4) {
              quality -= 0.1;
            } else {
              width = Math.round(width * 0.85);
              height = Math.round(height * 0.85);
            }
          }
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('ছবি load করা যায়নি'));
        img.src = String(reader.result || '');
      };
      reader.onerror = () => reject(new Error('ছবি পড়া যায়নি'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('শুধুমাত্র image file upload করুন');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result || ''));
    reader.onerror = () => toast.error('ছবি পড়া যায়নি');
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!user) return;
    setSavingPhoto(true);

    try {
      const MAX = 150 * 1024;
      const dataUrl = await compressImage(file, MAX);
      const finalBytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
      if (finalBytes > MAX) {
        setSavingPhoto(false);
        toast.error('ছবিটি 150 KB-এর নিচে আনা যায়নি, অনুগ্রহ করে ছোট ছবি দিন');
        return;
      }
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
      setCropSrc(null);
      toast.success('Profile photo updated');
      refreshProfile();
    } catch (err: any) {
      setSavingPhoto(false);
      toast.error(err?.message || 'ছবি upload করা যায়নি');
    }
  };

  const handleDeletePhoto = async () => {
    if (!user || !avatarUrl) return;
    if (!confirm('Profile photo delete করতে চান?')) return;
    setSavingPhoto(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null } as any)
      .eq('id', user.id);
    setSavingPhoto(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAvatarUrl('');
    toast.success('Profile photo deleted');
    refreshProfile();
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
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={savingPhoto} asChild>
                  <label htmlFor="profile-photo" className="cursor-pointer">
                    {savingPhoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                    {avatarUrl ? 'Change Photo' : 'Upload Photo'}
                  </label>
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingPhoto}
                    onClick={handleDeletePhoto}
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                )}
                <Input id="profile-photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </div>
              <p className="text-xs text-muted-foreground">বড় ছবি আপলোড করলে স্বয়ংক্রিয়ভাবে 150 KB-এর মধ্যে compress হবে।</p>
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
