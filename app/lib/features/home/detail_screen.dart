import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/auction.dart';
import '../../models/user.dart';

class DetailScreen extends StatelessWidget {
  const DetailScreen({
    super.key,
    required this.auction,
    required this.user,
    required this.onEnterLive,
  });

  final Auction auction;
  final User user;
  final VoidCallback onEnterLive;

  String _fmt(int p) => p.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    final isLive = auction.status == 'live';
    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.favorite_border, color: Colors.white),
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('준비 중이에요')),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.home_outlined, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Hero image area
          SizedBox(
            height: 280,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Container(
                  color: AppColors.surface,
                  child: const Center(
                    child: Icon(Icons.image_outlined, size: 64, color: AppColors.inkMute),
                  ),
                ),
                // gradient overlay for readability
                Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.black45, Colors.transparent, Colors.black26],
                    ),
                  ),
                ),
                if (isLive)
                  Positioned(
                    bottom: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.cta,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'LIVE',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Tags row
                  Wrap(
                    spacing: 6,
                    children: [
                      if (isLive) _TagChip(label: '지금 라이브', color: AppColors.cta),
                      _TagChip(label: '오늘 새벽 수확', color: AppColors.accentSoft),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Title
                  Text(
                    auction.productName,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Seller row
                  Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          color: AppColors.accentSoft,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          auction.sellerId.isNotEmpty ? auction.sellerId[0] : '?',
                          style: const TextStyle(fontSize: 12, color: AppColors.ink, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '판매자 ${auction.sellerId}',
                        style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Stats box
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Row(
                      children: [
                        _StatBox(
                          label: '현재가',
                          value: '${_fmt(auction.currentPrice)}원',
                          valueColor: AppColors.accent,
                        ),
                        _divider(),
                        _StatBox(
                          label: '입찰자',
                          value: auction.topBidder ?? '-',
                        ),
                        _divider(),
                        _StatBox(
                          label: '남은시간',
                          value: auction.timeLeft != null ? '${auction.timeLeft}초' : '-',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Bid history header
                  Row(
                    children: [
                      const Text(
                        '입찰 현황',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                      ),
                      const Spacer(),
                      Text(
                        '시작가 ${_fmt(auction.startPrice)}원',
                        style: const TextStyle(fontSize: 12, color: AppColors.inkMute),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Bid history list (placeholder)
                  if (auction.topBidder != null)
                    _BidRow(
                      bidder: auction.topBidder!,
                      price: auction.currentPrice,
                      isTop: true,
                    )
                  else
                    const Text(
                      '아직 입찰이 없어요',
                      style: TextStyle(fontSize: 13, color: AppColors.inkMute),
                    ),
                  const SizedBox(height: 20),

                  // Product description
                  const Text(
                    '상품 설명',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '신선한 ${auction.productName}을 산지에서 직접 수확하여 당일 배송합니다. 최상의 품질을 약속드립니다.',
                    style: const TextStyle(fontSize: 14, color: AppColors.inkSoft, height: 1.6),
                  ),
                  const SizedBox(height: 80),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(
            children: [
              OutlinedButton(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('준비 중이에요')),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.inkSoft,
                  side: const BorderSide(color: AppColors.line),
                  minimumSize: const Size(0, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.favorite_border, size: 18),
                    SizedBox(width: 6),
                    Text('관심상품', style: TextStyle(fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: onEnterLive,
                  child: Text(
                    isLive ? '라이브 입장' : '입찰 참여',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _divider() => Container(
        width: 1,
        height: 36,
        color: AppColors.line,
        margin: const EdgeInsets.symmetric(horizontal: 12),
      );
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({required this.label, required this.value, this.valueColor});
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: valueColor ?? AppColors.ink,
            ),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.inkMute)),
        ],
      ),
    );
  }
}

class _BidRow extends StatelessWidget {
  const _BidRow({required this.bidder, required this.price, required this.isTop});
  final String bidder;
  final int price;
  final bool isTop;

  String _fmt(int p) => p.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          if (isTop)
            const Icon(Icons.emoji_events, size: 16, color: AppColors.warn)
          else
            const SizedBox(width: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              bidder,
              style: TextStyle(
                fontSize: 13,
                color: isTop ? AppColors.ink : AppColors.inkSoft,
                fontWeight: isTop ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
          Text(
            '${_fmt(price)}원',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: isTop ? AppColors.accent : AppColors.inkSoft,
            ),
          ),
        ],
      ),
    );
  }
}
