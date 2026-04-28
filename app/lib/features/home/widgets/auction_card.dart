import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../../../models/live.dart';

class LiveCard extends StatelessWidget {
  const LiveCard({super.key, required this.live, required this.onTap});
  final Live live;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final currentAuction = live.currentAuction;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Thumbnail 110x110
            ClipRRect(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(14),
                bottomLeft: Radius.circular(14),
              ),
              child: SizedBox(
                width: 110,
                height: 110,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [AppColors.surfaceAlt, AppColors.surface],
                        ),
                      ),
                    ),
                    CustomPaint(
                      painter: _DiagonalPatternPainter(),
                    ),
                    const Center(
                      child: Icon(
                        Icons.videocam_outlined,
                        size: 32,
                        color: AppColors.inkMute,
                      ),
                    ),
                    // Always show LIVE badge
                    Positioned(
                      top: 6,
                      left: 6,
                      child: _LiveBadge(),
                    ),
                    // Timer when auction is running
                    if (currentAuction?.timeLeft != null)
                      Positioned(
                        bottom: 6,
                        left: 6,
                        child: _TimerLabel(timeLeft: currentAuction!.timeLeft!),
                      ),
                  ],
                ),
              ),
            ),
            // Info area
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Live title
                    Text(
                      live.title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                        height: 1.4,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    // Current auction product name
                    Text(
                      currentAuction?.productName ?? '상품 대기 중',
                      style: TextStyle(
                        fontSize: 12,
                        color: currentAuction != null
                            ? AppColors.inkMute
                            : AppColors.inkMute,
                        height: 1.4,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    // Seller id
                    Text(
                      live.sellerId,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.inkMute,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Price (only when auction exists)
                        if (currentAuction != null) ...[
                          Text(
                            '${_formatPrice(currentAuction.currentPrice)}원',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        // Viewer count
                        const Icon(Icons.visibility,
                            size: 12, color: AppColors.inkMute),
                        const SizedBox(width: 2),
                        Text(
                          '${live.viewerCount}',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.inkMute,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
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

class _LiveBadge extends StatefulWidget {
  @override
  State<_LiveBadge> createState() => _LiveBadgeState();
}

class _LiveBadgeState extends State<_LiveBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.3, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.danger,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: _anim,
            child: Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 4),
          const Text(
            'LIVE',
            style: TextStyle(
              color: Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _DiagonalPatternPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.04)
      ..strokeWidth = 1;
    const spacing = 9.0;
    for (double i = -size.height; i < size.width + size.height; i += spacing) {
      canvas.drawLine(Offset(i, 0), Offset(i + size.height, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(_DiagonalPatternPainter old) => false;
}

class _TimerLabel extends StatelessWidget {
  const _TimerLabel({required this.timeLeft});
  final int timeLeft;

  @override
  Widget build(BuildContext context) {
    final color = timeLeft <= 3
        ? AppColors.danger
        : timeLeft <= 10
            ? AppColors.warn
            : AppColors.inkMute;
    return Text(
      '${timeLeft}s',
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w500,
        color: color,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}
