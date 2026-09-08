// 결제 Provider registry + PaymentService 진입점.
// 실제 PG 연동(Toss 등) 추가 시: 새 Provider 구현체를 만들고 아래에서
// paymentService.registerProvider(...) / setMethodDefault(...) 만 교체하면 된다.

import { PaymentService } from './payment-service';
import { internalPayProvider } from './mock/internal-pay-provider';
import { mockCardProvider } from './mock/mock-card-provider';
import { mockAccountProvider } from './mock/mock-account-provider';
import { mockMobileProvider } from './mock/mock-mobile-provider';
import { mockVirtualAccountProvider } from './mock/mock-virtual-account-provider';

export * from './provider';
export { PaymentService } from './payment-service';

export const paymentService = new PaymentService();

paymentService.registerProvider(internalPayProvider.name, internalPayProvider);
paymentService.registerProvider(mockCardProvider.name, mockCardProvider);
paymentService.registerProvider(mockAccountProvider.name, mockAccountProvider);
paymentService.registerProvider(mockMobileProvider.name, mockMobileProvider);
paymentService.registerProvider(mockVirtualAccountProvider.name, mockVirtualAccountProvider);

// 결제수단별 기본 Provider (Phase 1: 전량 Mock. MOCK_PG_ENABLED=false 전환 시 실제 PG Provider로 교체)
paymentService.setMethodDefault('MONEY', internalPayProvider.name);
paymentService.setMethodDefault('CARD', mockCardProvider.name);
paymentService.setMethodDefault('ACCOUNT', mockAccountProvider.name);
paymentService.setMethodDefault('MOBILE', mockMobileProvider.name);
paymentService.setMethodDefault('VIRTUAL_ACCOUNT', mockVirtualAccountProvider.name);
