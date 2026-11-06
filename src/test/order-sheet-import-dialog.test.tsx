import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderSheetImportDialog from '@/components/OrderSheetImportDialog';

const mockUseAuth = vi.fn();
const mockUpsertCustomer = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ upsertCustomer: mockUpsertCustomer }) }));
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({
    recognize: vi.fn(async () => ({
      data: { text: 'اسم العميل: أحمد محمد\nرقم الهاتف: 01012345678\nالعنوان: مدينة نصر\nالطلب: وجبة فراخ' },
    })),
    terminate: vi.fn(),
  })),
}));

describe('OrderSheetImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ role: 'owner', pagePermissions: [], isDemoMode: false });
    mockUpsertCustomer.mockResolvedValue(true);
  });

  it('parses a pasted order, lets the user review it, and saves it to the selected brand', async () => {
    const addOrder = vi.fn().mockResolvedValue(true);
    const onImported = vi.fn();
    render(
      <OrderSheetImportDialog
        addOrder={addOrder}
        onImported={onImported}
        brands={[{ id: 'brand-1', name: 'Healthy Food', color: '#22c55e' }]}
        meals={[]}
        packages={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /استيراد طلبات/i }));
    fireEvent.click(screen.getByRole('button', { name: 'لصق نص' }));
    fireEvent.change(screen.getByLabelText('الصق رسالة العميل أو تفاصيل الطلب'), {
      target: { value: 'اسم العميل: أحمد محمد\nرقم الهاتف: ٠١٠٠٠٢٥٢٦٥٤\nالعنوان: مدينة نصر\nالطلب: وجبة فراخ + أرز\nالسعر: ٢٥٠ جنيه' },
    });
    fireEvent.click(screen.getByRole('button', { name: /تحليل بيانات الطلب/i }));

    expect(await screen.findByDisplayValue('أحمد محمد')).toBeInTheDocument();
    expect(screen.getByDisplayValue('01000252654')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تأكيد الاستيراد/i }));

    await waitFor(() => expect(addOrder).toHaveBeenCalledOnce());
    expect(mockUpsertCustomer).toHaveBeenCalledWith(expect.objectContaining({
      brand_id: 'brand-1',
      name: 'أحمد محمد',
      phone: '01000252654',
      address: 'مدينة نصر',
    }));
    expect(addOrder).toHaveBeenCalledWith(expect.objectContaining({
      customer_name: 'أحمد محمد',
      phone: '01000252654',
      brand_id: 'brand-1',
      price: 250,
      notes: expect.stringContaining('تفاصيل الطلب المستوردة: وجبة فراخ + أرز'),
    }));
    expect(onImported).toHaveBeenCalledOnce();
  });

  it('extracts an order from an image and makes the OCR result editable before saving', async () => {
    const addOrder = vi.fn().mockResolvedValue(true);
    render(
      <OrderSheetImportDialog
        addOrder={addOrder}
        onImported={vi.fn()}
        brands={[{ id: 'brand-1', name: 'Healthy Food', color: '#22c55e' }]}
        meals={[]}
        packages={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /استيراد طلبات/i }));
    fireEvent.click(screen.getByRole('button', { name: 'صورة' }));
    fireEvent.change(screen.getByLabelText('ارفع Screenshot أو صورة الطلب'), {
      target: { files: [new File(['image'], 'order.png', { type: 'image/png' })] },
    });

    expect(await screen.findByDisplayValue('أحمد محمد')).toBeInTheDocument();
    expect(screen.getByLabelText('النص المقروء (يمكن تصحيحه ثم إعادة التحليل)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تأكيد الاستيراد/i }));

    await waitFor(() => expect(addOrder).toHaveBeenCalledWith(expect.objectContaining({
      customer_name: 'أحمد محمد',
      phone: '01012345678',
      brand_id: 'brand-1',
    })));
  });
});
