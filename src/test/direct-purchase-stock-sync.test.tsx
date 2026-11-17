import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SmartPurchaseImportDialog from '@/components/SmartPurchaseImportDialog';
import DirectMultiPurchaseDialog from '@/components/procurement/DirectMultiPurchaseDialog';

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
});
