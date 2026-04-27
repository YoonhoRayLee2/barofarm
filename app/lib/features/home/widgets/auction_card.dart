import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../../../models/auction.dart';

class AuctionCard extends StatelessWidget {
  const AuctionCard({super.key, required this.auction, required this.onTap});
  final Auction auction;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isLive = auction.status == 'live';
    return GestureDetector(
      onTap: onTap,
      child: Card(
        clipBehavior: Clip.hardEdge,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 16:9 image placeholder
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(color: AppColors.bgAlt),
                  const Center(
                    child: Icon(Icons.videocam_outlined, size: 40, color: AppColors.inkMute),
                  ),
                  if (isLive)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: _LiveBadge(),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    auction.productName,
                    style: Theme.of(context).textTheme.headlineSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${_formatPrice(auction.currentPrice)}원',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                      ),
                      if (isLive && auction.timeLeft != null)
                        _TimerChip(timeLeft: auction.timeLeft!),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatPrice(int price) {
    return price.toString().replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }
}

class _LiveBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.live,
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        'LIVE',
        style: TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _TimerChip extends StatelessWidget {
  const _TimerChip({required this.timeLeft});
  final int timeLeft;

  @override
  Widget build(BuildContext context) {
    final color = timeLeft <= 3
        ? AppColors.danger
        : timeLeft <= 10
            ? AppColors.warning
            : AppColors.inkMute;
    return Text(
      '${timeLeft}s',
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color),
    );
  }
}
