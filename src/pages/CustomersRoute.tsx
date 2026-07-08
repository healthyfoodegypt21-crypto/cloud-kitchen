import CustomersPage from '@/pages/Customers';
import { useBrands } from '@/hooks/useBrands';
import { useCustomers } from '@/hooks/useCustomers';
import { useOrders } from '@/hooks/useOrders';

export default function CustomersRoute() {
  const { brands } = useBrands();
  const { customers, loading, storageMode } = useCustomers();
  const { orders } = useOrders();

  return <CustomersPage customers={customers} orders={orders} loading={loading} brands={brands} storageMode={storageMode} />;
}