import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AiVisionConfig,
  AiVisionProvider,
  loadAiVisionConfig,
  saveAiVisionConfig,
  testAiVisionConnection,
} from '@/lib/ocrImage';
import { cn } from '@/lib/utils';

interface Props {
  compact?: boolean;
}

export default function AiVisionStatusControl({ compact = true }: Props) {
  const [config, setConfig] = useState<AiVisionConfig>(() => loadAiVisionConfig());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AiVisionConfig>(() => loadAiVisionConfig());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const isActive = config.enabled && Boolean(config.apiKey.trim());

  const openModal = () => {
    setDraft(loadAiVisionConfig());
    setOpen(true);
  };

  const handleTest = async () => {
    setTesting(true);
    const res = await testAiVisionConnection(draft);
    setTesting(false);
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  const handleSave = () => {
    const cleaned: AiVisionConfig = {
      enabled: draft.enabled && Boolean(draft.apiKey.trim()),
      provider: draft.provider,
      apiKey: draft.apiKey.trim(),
      model: draft.model?.trim() || undefined,
    };
    saveAiVisionConfig(cleaned);
    setConfig(cleaned);
    setOpen(false);
    toast.success(
      cleaned.enabled
        ? 'تم تفعيل محرك الذكاء الاصطناعي لقراءة خط اليد والفواتير'
        : 'تم الحفظ — يعمل الآن المحرك الضوئي المحسّن محلياً',
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
          isActive
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
          !compact && 'px-3 py-1.5 text-xs',
        )}
      >
        {isActive ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>قارئ خط اليد الذكي (AI Vision) مفعّل</span>
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span>OCR محسّن + تفعيل قارئ خط اليد الذكي</span>
          </>
        )}
        <Settings2 className="h-3 w-3 opacity-60" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              إعداد محرك الذكاء الاصطناعي لقراءة الصور وخط اليد (AI Vision)
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              يعمل النظام تلقائياً بمحرك معالجة الصور الضوئي المحسّن، وعند إضافة مفتاح <strong>Google Gemini</strong> (مجاني من Google AI Studio) أو <strong>OpenAI</strong> يقرأ الفواتير وورق المسحوبات والطلبات المكتوبة بخط اليد بدقة فائقة مع مطابقة أصنافك تلقائياً.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <p className="text-xs font-bold text-slate-900">تفعيل القراءة بالذكاء الاصطناعي (AI Vision)</p>
                <p className="text-[11px] text-slate-500">في حال التعطيل أو انقطاع الإنترنت يعمل المحرك الضوئي المحسّن تلقائياً.</p>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">مزود الذكاء الاصطناعي</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-xs font-medium"
                value={draft.provider}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    provider: e.target.value as AiVisionProvider,
                    model: '',
                  }))
                }
              >
                <option value="gemini">Google Gemini Flash Vision (موصى به — يدعم مفتاح مجاني)</option>
                <option value="openai">OpenAI GPT-4o-mini Vision</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">مفتاح الـ API (يُحفظ على متصفحك فقط)</Label>
              <div className="relative">
                <Input
                  dir="ltr"
                  type={showKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value, enabled: true }))}
                  placeholder={draft.provider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                  className="pl-9 text-left font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="إظهار أو إخفاء المفتاح"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={testing || !draft.apiKey.trim()}
                onClick={() => void handleTest()}
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                <span>اختبار الاتصال الآن</span>
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
            >
              حفظ الإعدادات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
