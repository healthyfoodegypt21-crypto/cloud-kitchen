import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
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
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
    mockUseAuth.mockReturnValue({ role: 'owner', pagePermissions: [], isDemoMode: false });
    mockUpsertCustomer.mockResolvedValue(true);
  });

  it('parses a pasted order, lets the user review it, and saves it to the selected brand', async () => {
    const saveImportedOrder = vi.fn().mockResolvedValue('imported');
    const onImported = vi.fn();
    render(
      <OrderSheetImportDialog
        saveImportedOrder={saveImportedOrder}
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
    fireEvent.click(screen.getByRole('button', { name: /استيراد الطلبات دفعة واحدة/i }));

    await waitFor(() => expect(saveImportedOrder).toHaveBeenCalledOnce());
    expect(mockUpsertCustomer).toHaveBeenCalledWith(expect.objectContaining({
      brand_id: 'brand-1',
      name: 'أحمد محمد',
      phone: '01000252654',
      address: 'مدينة نصر',
    }));
    expect(saveImportedOrder).toHaveBeenCalledWith(expect.objectContaining({
      customer_name: 'أحمد محمد',
      phone: '01000252654',
      brand_id: 'brand-1',
      price: 250,
      notes: expect.stringContaining('تفاصيل الطلب المستوردة: وجبة فراخ + أرز'),
    }));
    expect(onImported).toHaveBeenCalledOnce();
  });

  it('extracts an order from an image and makes the OCR result editable before saving', async () => {
    const saveImportedOrder = vi.fn().mockResolvedValue('imported');
    render(
      <OrderSheetImportDialog
        saveImportedOrder={saveImportedOrder}
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
    fireEvent.click(screen.getByRole('button', { name: /استيراد الطلبات دفعة واحدة/i }));

    await waitFor(() => expect(saveImportedOrder).toHaveBeenCalledWith(expect.objectContaining({
      customer_name: 'أحمد محمد',
      phone: '01012345678',
      brand_id: 'brand-1',
    })));
  });

  it('uses one brand and one required execution date for every order sheet, skipping non-order sheets', async () => {
    const saveImportedOrder = vi.fn().mockResolvedValue('imported');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['اسم العميل', 'الهاتف', 'الطلب', 'تاريخ التنفيذ'],
      ['أحمد محمد', '01012345678', 'وجبة فراخ', '2026-01-01'],
    ]), 'Sheet1');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['اسم العميل', 'الهاتف', 'الطلب'],
      ['سارة محمد', '01087654321', 'وجبة سمك'],
    ]), 'Sheet3');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Capacity', 'Count'],
      ['Meals', 10],
    ]), 'Capacity Map');
    const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const file = new File([buffer], 'orders.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer });

    render(
      <OrderSheetImportDialog
        saveImportedOrder={saveImportedOrder}
        onImported={vi.fn()}
        brands={[
          { id: 'brand-1', name: 'Healthy Food', color: '#22c55e' },
          { id: 'brand-2', name: 'Healthy Station', color: '#3b82f6' },
        ]}
        meals={[]}
        packages={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /استيراد طلبات/i }));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'صفحة الطلبات' }));
    fireEvent.change(screen.getByLabelText('ملف Excel'), { target: { files: [file] } });

    const brandSelect = await screen.findByLabelText('العلامة التجارية للملف بالكامل');
    fireEvent.click(brandSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Healthy Station' }));
    fireEvent.click(await screen.findByLabelText('تاريخ تنفيذ كل الطلبات في الملف'));
    fireEvent.click(await screen.findByRole('button', { name: 'اليوم' }));

    expect(screen.queryByText('توزيع الشيتات على العلامات التجارية')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /استيراد الطلبات دفعة واحدة/i }));

    await waitFor(() => expect(saveImportedOrder).toHaveBeenCalledTimes(2));
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(saveImportedOrder).toHaveBeenNthCalledWith(1, expect.objectContaining({
      customer_name: 'أحمد محمد',
      brand_id: 'brand-2',
      execution_date: todayValue,
    }));
    expect(saveImportedOrder).toHaveBeenNthCalledWith(2, expect.objectContaining({
      customer_name: 'سارة محمد',
      brand_id: 'brand-2',
      execution_date: todayValue,
    }));
  });

  it('reports a repeated upload as a duplicate instead of counting it as a new order', async () => {
    let importedOrderNumber: string | null = null;
    const saveImportedOrder = vi.fn(async (order: { order_number: string }) => {
      if (importedOrderNumber === order.order_number) return 'duplicate' as const;
      importedOrderNumber = order.order_number;
      return 'imported' as const;
    });

    render(
      <OrderSheetImportDialog
        saveImportedOrder={saveImportedOrder}
        onImported={vi.fn()}
        brands={[{ id: 'brand-1', name: 'Healthy Food', color: '#22c55e' }]}
        meals={[]}
        packages={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /استيراد طلبات/i }));
    fireEvent.click(screen.getByRole('button', { name: 'لصق نص' }));
    fireEvent.change(screen.getByLabelText('الصق رسالة العميل أو تفاصيل الطلب'), {
      target: { value: 'اسم العميل: أحمد محمد\nرقم الهاتف: 01012345678\nالعنوان: مدينة نصر\nالطلب: وجبة فراخ\nالسعر: 250' },
    });
    fireEvent.click(screen.getByRole('button', { name: /تحليل بيانات الطلب/i }));
    fireEvent.click(screen.getByRole('button', { name: /استيراد الطلبات دفعة واحدة/i }));
    await screen.findByText('تم استيراد 1 طلب.');

    fireEvent.click(screen.getByRole('button', { name: /استيراد الطلبات دفعة واحدة/i }));
    expect(await screen.findByText('تم تجاهل 1 طلب مكرر لتجنب تكرار التنفيذ.')).toBeInTheDocument();
    expect(saveImportedOrder).toHaveBeenCalledTimes(2);
    expect(saveImportedOrder.mock.calls[0][0].order_number).toBe(saveImportedOrder.mock.calls[1][0].order_number);
  });
});
