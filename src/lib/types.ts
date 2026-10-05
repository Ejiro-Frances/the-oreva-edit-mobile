export type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  position: number;
  active: boolean;
};
export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  price: number;
  compare_at: number | null;
  image: string | null;
  alt: string;
  audience: string;
  category: string;
  inStock: boolean;
};
export type Variant = {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: number | null;
  stock: number;
  image?: string | null;
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  category: string;
  audience: string;
  status: 'draft' | 'active' | 'archived';
  price: number;
  compare_at: number | null;
  images: string[];
  alt: string;
  variants: Variant[];
  details: string[];
  care: string;
};
export type CartLine = { variantId: string; quantity: number };
export type LineDetail = {
  variantId: string;
  product: { id: string; slug: string; name: string; image: string | null; alt: string; price: number };
  variant: { attributes: Record<string, string>; price: number | null; stock: number };
};
export type BagLine = LineDetail & { quantity: number };
export type BagView = { lines: BagLine[]; wishlist: string[]; adjusted?: string[] };
export type Tokens = { access_token: string; refresh_token: string; expires_at?: number };
