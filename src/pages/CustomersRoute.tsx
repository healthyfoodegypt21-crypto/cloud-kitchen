import CustomersPage from '@/pages/Customers';
import { useBrands } from '@/hooks/useBrands';
import { useCustomers } from '@/hooks/useCustomers';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { useOrders } from '@/hooks/useOrders';

export default function CustomersRoute() {
  const { brands } = useBrands();
  const { customers, loading, storageMode, upsertCustomer } = useCustomers();
  const { orders } = useOrders();
  const { meals, packages } = useMenuCatalog();

  return (
    <CustomersPage
      customers={customers}
      orders={orders}
      loading={loading}
      brands={brands}
      storageMode={storageMode}
      meals={meals}
      packages={packages}
      onUpdateCustomer={upsertCustomer}
    />
  );
}