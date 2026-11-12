import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50/80 p-6 text-slate-900 antialiased">
      <div className="w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
          <BrandLogo compact iconClassName="w-6 h-6 text-white" />
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-0.5 text-xs font-bold text-slate-600 tabular-nums">
          404
        </span>
        <h1 className="mt-3 text-lg font-bold text-slate-900">عذرًا، الصفحة غير موجودة</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          الرابط الذي حاولت فتحه غير متاح أو تم نقله إلى مسار آخر داخل النظام.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
        >
          <span>العودة إلى لوحة التحكم</span>
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
