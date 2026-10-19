export interface Product {
  name: string;
  category: string;
}

/** 분석 대상 상품. Real Mode에서 상품이 데이터에서 오게 되면 이 모듈만 교체한다. */
export const PRODUCT: Product = {
  name: "노이즈캔슬링 무선 이어폰 PRO",
  category: "무선 이어폰",
};
