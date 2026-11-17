import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SmartPurchaseImportDialog from '@/components/SmartPurchaseImportDialog';
import DirectMultiPurchaseDialog from '@/components/procurement/DirectMultiPurchaseDialog';
import { inferSmartItemCategory } from '@/lib/smartCategoryClassifier';

vi.mock('@/components/AiVisionStatusControl', () => ({
  default: () => null,
}));

describe('Direct & Smart Purchase Immediate Stock Sync', () => {
  it('SmartPurchaseImportDialog defaults autoReceive=true and maps categories to inventory_categories codes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(
      <SmartPurchaseImportDialog
        open={true}
        inventoryItems={[]}
        suppliers={[]}
        categories={[
          { code: 'proteins', name: 'البروتينات' },
          { code: 'vegetables', name: 'الخضروات' },
          { code: 'carbohydrates', name: 'الكربوهيدرات' },
          { code: 'other', name: 'أخرى' },
        ]}
        defaultPurchaserName="Yassen"
        startWith="message"
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByLabelText('رسالة واتساب أو نص الفاتورة');
    fireEvent.change(textarea, {
      target: {
        value: 'طماطم 2 كجم × 20\nلحمه 3 كجم × 340\nشكات بطاطس 45 كجم × 22',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تحليل النص' }));

    const submitBtn = await screen.findByRole('button', {
      name: 'حفظ المشتريات وإضافتها للمخزون فوراً',
    });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.autoReceive).toBe(true);
    expect(payload.lines).toEqual([
      expect.objectContaining({ itemName: 'طماطم', category: 'vegetables', quantity: 2, unitPrice: 20 }),
      expect.objectContaining({ itemName: 'لحمه', category: 'proteins', quantity: 3, unitPrice: 340 }),
      expect.objectContaining({ itemName: 'شكات بطاطس', category: 'carbohydrates', quantity: 45, unitPrice: 22 }),
    ]);
  });

  it('SmartPurchaseImportDialog sends autoReceive=false when deferred receipt is chosen', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(
      <SmartPurchaseImportDialog
        open={true}
        inventoryItems={[]}
        suppliers={[]}
        categories={[{ code: 'vegetables', name: 'الخضروات' }]}
        defaultPurchaserName="Yassen"
        startWith="message"
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('رسالة واتساب أو نص الفاتورة'), {
      target: { value: 'طماطم 5 كجم × 20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تحليل النص' }));

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    const submitBtn = screen.getByRole('button', {
      name: 'تسجيل الشراء بانتظار استلام المخزن',
    });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].autoReceive).toBe(false);
  });

  it('DirectMultiPurchaseDialog defaults autoReceive=true so direct invoices update available stock immediately', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(
      <DirectMultiPurchaseDialog
        open={true}
        onOpenChange={() => {}}
        items={[
          {
            id: 'item-1',
            name: 'صدور دجاج',
            code: 'CHK-01',
            purchaseUnit: 'kg',
            usageUnit: 'kg',
            conversionFactor: 1,
            lastPrice: 190,
            averageCost: 190,
          },
        ]}
        suppliers={[]}
        authenticatedAccountName="Yassen"
        onSubmit={onSubmit}
      />,
    );

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'item-1' } });

    const submitBtn = screen.getByRole('button', {
      name: /حفظ الفاتورة وإضافة الأصناف للمخزون فوراً/,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      autoReceive: true,
      purchaserName: 'Yassen',
      lines: [
        expect.objectContaining({
          itemId: 'item-1',
          quantity: 1,
          unitCost: 190,
        }),
      ],
    });
  });

  it('DirectMultiPurchaseDialog detects existing catalog item when typing a synonymous new item name', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(
      <DirectMultiPurchaseDialog
        open={true}
        onOpenChange={() => {}}
        items={[
          {
            id: 'item-cab',
            name: 'كابوتشا',
            code: 'CAB-01',
            purchaseUnit: 'piece',
            usageUnit: 'piece',
            conversionFactor: 1,
            lastPrice: 9,
            averageCost: 9,
          },
        ]}
        suppliers={[]}
        authenticatedAccountName="Yassen"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ تعريف كصنف جديد غير مسجل/ }));
    const newNameInput = screen.getByPlaceholderText('مثال: كابوتشا / صوص ديمي جلاس');
    fireEvent.change(newNameInput, { target: { value: 'كابوتشا ال' } });

    const useExistingBtn = await screen.findByRole('button', { name: 'استخدام «كابوتشا»' });
    fireEvent.click(useExistingBtn);

    const submitBtn = screen.getByRole('button', {
      name: /حفظ الفاتورة وإضافة الأصناف للمخزون فوراً/,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].lines[0]).toMatchObject({
      itemId: 'item-cab',
      unitCost: 9,
    });
  });

  it('automatically recognizes item categories like كابوتشا -> vegetables across classifier and new-item forms', async () => {
    const dbCategories = [
      { code: '01', name: 'مكسرات ' },
      { code: 'proteins', name: 'البروتينات' },
      { code: 'vegetables', name: 'الخضروات' },
      { code: 'carbohydrates', name: 'الكربوهيدرات' },
      { code: 'dairy', name: 'منتجات الألبان' },
      { code: 'sauces', name: 'الصوصات' },
      { code: 'spices', name: 'البهارات والتوابل' },
      { code: 'cleaning', name: 'المنظفات' },
      { code: 'packaging', name: 'مواد التعبئة والتغليف' },
      { code: 'other', name: 'أخرى' },
    ];

    expect(inferSmartItemCategory('كابوتشا', dbCategories)).toBe('vegetables');
    expect(inferSmartItemCategory('حزم خضره', dbCategories)).toBe('vegetables');
    expect(inferSmartItemCategory('مشروم', dbCategories)).toBe('vegetables');
    expect(inferSmartItemCategory('فلفل ألوان', dbCategories)).toBe('vegetables');
    expect(inferSmartItemCategory('فلفل أسود مطحون', dbCategories)).toBe('spices');
    expect(inferSmartItemCategory('ثوم بودر', dbCategories)).toBe('spices');
    expect(inferSmartItemCategory('ثوم', dbCategories)).toBe('vegetables');
    expect(inferSmartItemCategory('ريتش بيك توست ردة', dbCategories)).toBe('carbohydrates');
    expect(inferSmartItemCategory('كاتشب', dbCategories)).toBe('sauces');
    expect(inferSmartItemCategory('سلك موعين', dbCategories)).toBe('cleaning');
    expect(inferSmartItemCategory('فلاش', dbCategories)).toBe('cleaning');
    expect(inferSmartItemCategory('كاجو', dbCategories)).toBe('01');
    expect(inferSmartItemCategory('علبة تونة', dbCategories)).toBe('proteins');
    expect(inferSmartItemCategory('علب وجبات بلاستيك', dbCategories)).toBe('packaging');

    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <DirectMultiPurchaseDialog
        open={true}
        onOpenChange={() => {}}
        items={[]}
        suppliers={[]}
        categories={dbCategories}
        authenticatedAccountName="Yassen"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ تعريف كصنف جديد غير مسجل/ }));
    fireEvent.change(screen.getByPlaceholderText('مثال: كابوتشا / صوص ديمي جلاس'), {
      target: { value: 'كابوتشا' },
    });
    fireEvent.change(screen.getAllByRole('spinbutton')[1], {
      target: { value: '9' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /حفظ الفاتورة وإضافة الأصناف للمخزون فوراً/ }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].lines[0]).toMatchObject({
      newItemName: 'كابوتشا',
      newItemCategory: 'vegetables',
    });
  });
});
