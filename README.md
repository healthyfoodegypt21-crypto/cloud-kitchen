# Cloud Kitchen

تطبيق إدارة مطبخ سحابي مبني بـ Vite وReact وSupabase لإدارة الطلبات والعملاء والمطبخ والمخزون والمنيو والباقات.

## نظرة سريعة

- الواجهة: React 18 + Vite + TypeScript + Tailwind + shadcn/ui.
- البيانات والمصادقة: Supabase Auth + Postgres + RLS + Edge Functions.
- الاختبارات الحالية: Vitest لمستوى الوحدات والمكونات، مع إعداد Playwright جاهز للتوسعة.
- اللغات والاتجاه: الواجهة عربية مع `rtl`.

## التشغيل المحلي

### المتطلبات

- Node.js 20 أو أحدث.
- npm.
- مشروع Supabase جاهز مع تطبيق جميع ملفات migration داخل [supabase/migrations](supabase/migrations).

### متغيرات البيئة

يحتاج التطبيق إلى المتغيرات التالية داخل `.env` أو `.env.local` محليًا، أو داخل Vercel Project Settings عند النشر:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### التثبيت

```bash
npm install
```

### أوامر التطوير

```bash
npm run dev
npm run lint
npm run test
npm run build
```

## البنية العامة

### الواجهة

- [src/App.tsx](src/App.tsx): تهيئة التطبيق، التوجيه، وحماية المسارات.
- [src/components](src/components): المكونات القابلة لإعادة الاستخدام والواجهات الرئيسية.
- [src/pages](src/pages): الشاشات والصفحات حسب المجال.

### المنطق والبيانات

- [src/hooks](src/hooks): منطق المصادقة، الطلبات، العملاء، المنيو، المخزون، والأهداف.
- [src/store](src/store): تخزين محلي لبعض الوحدات التي لم تُرحّل بالكامل إلى Supabase.
- [src/lib](src/lib): دوال الأعمال والتحويلات والمساعدات المشتركة.

### Supabase

- [supabase/migrations](supabase/migrations): تطور المخطط والسياسات.
- [supabase/functions/create-user/index.ts](supabase/functions/create-user/index.ts): إدارة إنشاء المستخدمين والصلاحيات.
- [supabase/functions/setup-owner/index.ts](supabase/functions/setup-owner/index.ts): bootstrap أول مالك.

## أوضاع التخزين الحالية

المشروع ليس موحد التخزين بالكامل بعد، لذلك توجد حالتان يجب فهمهما بوضوح:

1. البيانات التشغيلية الأساسية مثل المصادقة والطلبات والعملاء تعتمد على Supabase مع fallback محدود في بعض السيناريوهات.
2. بعض الوحدات ما زالت محلية بالكامل أو جزئيًا، مثل المخزون وبعض مسارات demo/local fallback.

### وضع demo المحلي

- وضع demo مخصص للتطوير المحلي وليس بديلًا تشغيليًا للمصادقة الحقيقية.
- يتم تخزين حالته داخل `sessionStorage` وليس `localStorage`.
- هذا الوضع لا يملك وصولًا إداريًا إلى صفحات مثل المستخدمين أو الإعدادات أو إدارة المنيو والمخزون.

## الصلاحيات

- الدور الأساسي للمستخدم يُقرأ من `user_roles`.
- صلاحيات الصفحات تُقرأ من `user_page_permissions`.
- الواجهة تفرض الصلاحيات عبر [src/lib/permissions.ts](src/lib/permissions.ts) و [src/hooks/useAuth.tsx](src/hooks/useAuth.tsx) و [src/App.tsx](src/App.tsx).
- الجداول الإدارية الحساسة أصبحت مرتبطة أيضًا بصلاحية صفحة `users` عبر migration الجديدة.

## المهاجرات

طبّق جميع الملفات داخل [supabase/migrations](supabase/migrations) بالترتيب الزمني. الملف الأحدث يضيف ما يلي:

- فهارس على `user_brand_access` و `user_page_permissions`.
- دوال `has_page_permission` و `has_any_page_permission`.
- backfill لصلاحيات الصفحات لحسابات `owner` الموجودة.
- ربط سياسات الجداول الإدارية بصفحة `users`.

إذا شغّلت التطبيق بدون تطبيق هذه الـ migrations، فقد ترى اختلافًا بين ما تسمح به الواجهة وما تسمح به القاعدة فعلًا.

## الاختبارات

الاختبارات الحالية موجودة داخل [src/test](src/test).

أمثلة على التحقق المنفذ حاليًا:

- حماية التنقل في وضع demo.
- تقييد إدارة المنيو في وضع demo.
- بناء الإنتاج عبر Vite.

تشغيل مجموعة اختبارات مركزة:

```bash
npm run test -- src/test/app-layout.test.tsx src/test/menu-packages.test.tsx
```

## CI

أضيف workflow أساسي داخل [.github/workflows/ci.yml](.github/workflows/ci.yml) لتشغيل:

- `npm run lint`
- `npm run test`
- `npm run build`

## ملاحظات تشغيلية

- تحذير حجم الحزم ما زال قائمًا في build لأن بعض الـ chunks تتجاوز 500KB بعد الضغط.
- المخزون ما زال local-first ويحتاج ترحيلًا فعليًا إلى Supabase إذا كان المطلوب تشغيلًا متعدد المستخدمين.
- Playwright مثبت وجاهز، لكن تغطية E2E ما زالت بحاجة توسعة إضافية.
