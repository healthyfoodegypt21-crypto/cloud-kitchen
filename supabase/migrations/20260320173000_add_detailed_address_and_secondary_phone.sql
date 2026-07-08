ALTER TABLE public.orders
ADD COLUMN phone_secondary text DEFAULT '',
ADD COLUMN address_house_number text DEFAULT '',
ADD COLUMN address_street text DEFAULT '',
ADD COLUMN address_area text DEFAULT '',
ADD COLUMN address_floor text DEFAULT '',
ADD COLUMN address_apartment text DEFAULT '';

UPDATE public.orders
SET
  phone_secondary = COALESCE(phone_secondary, ''),
  address_house_number = COALESCE(address_house_number, ''),
  address_street = COALESCE(address_street, ''),
  address_area = COALESCE(address_area, ''),
  address_floor = COALESCE(address_floor, ''),
  address_apartment = COALESCE(address_apartment, '');

ALTER TABLE public.orders
ALTER COLUMN phone_secondary SET NOT NULL,
ALTER COLUMN address_house_number SET NOT NULL,
ALTER COLUMN address_street SET NOT NULL,
ALTER COLUMN address_area SET NOT NULL,
ALTER COLUMN address_floor SET NOT NULL,
ALTER COLUMN address_apartment SET NOT NULL;