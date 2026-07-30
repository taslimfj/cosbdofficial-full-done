import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, ZoomIn } from 'lucide-react';

type Area = { x: number; y: number; width: number; height: number };

interface Props {
  open: boolean;
  imageSrc: string | null;
  saving?: boolean;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

async function getCroppedFile(imageSrc: string, crop: Area): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ছবি load করা যায়নি'));
    img.src = imageSrc;
  });

  const size = Math.min(512, Math.max(crop.width, crop.height));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Crop ব্যর্থ হয়েছে'))), 'image/jpeg', 0.92)
  );
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

export function ImageCropperDialog({ open, imageSrc, saving, onCancel, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setAreaPixels(pixels), []);

  const handleDone = async () => {
    if (!imageSrc || !areaPixels) return;
    setWorking(true);
    try {
      const file = await getCroppedFile(imageSrc, areaPixels);
      onCropped(file);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ছবি Crop করুন</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-64 bg-muted rounded-md overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={v => setZoom(v[0])} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={working || saving}>বাতিল</Button>
          <Button onClick={handleDone} disabled={working || saving || !areaPixels}>
            {(working || saving) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} সংরক্ষণ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
