import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';

/// TV 지지직 노이즈 + 네트워크 유실 메시지 오버레이
class StaticNoiseOverlay extends StatefulWidget {
  const StaticNoiseOverlay({super.key});

  @override
  State<StaticNoiseOverlay> createState() => _StaticNoiseOverlayState();
}

class _StaticNoiseOverlayState extends State<StaticNoiseOverlay> {
  final _rng = Random();
  late Timer _ticker;
  int _seed = 0;

  @override
  void initState() {
    super.initState();
    // 80ms마다 seed 교체 → 노이즈 프레임 전환 (~12fps)
    _ticker = Timer.periodic(const Duration(milliseconds: 80), (_) {
      if (mounted) setState(() => _seed = _rng.nextInt(0x7FFFFFFF));
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 노이즈 배경
        Positioned.fill(
          child: CustomPaint(painter: _NoisePainter(_seed)),
        ),
        // 가로선 스캔라인 효과
        Positioned.fill(
          child: CustomPaint(painter: _ScanlinePainter()),
        ),
        // 중앙 메시지 카드
        Center(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 32),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.72),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white24),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.signal_wifi_statusbar_connected_no_internet_4_rounded,
                  color: Colors.white70,
                  size: 36,
                ),
                const SizedBox(height: 12),
                const Text(
                  '네트워크 연결을 확인중입니다.\n잠시 기다려주세요',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    height: 1.6,
                    shadows: [Shadow(blurRadius: 4, color: Colors.black)],
                  ),
                ),
                const SizedBox(height: 16),
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(Colors.white54),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// 무작위 회색 픽셀 노이즈
class _NoisePainter extends CustomPainter {
  _NoisePainter(this.seed);
  final int seed;

  static const _px = 3.0; // 픽셀 크기 (클수록 성능↑, 노이즈↓)

  @override
  void paint(Canvas canvas, Size size) {
    final rng = Random(seed);
    final paint = Paint()..style = PaintingStyle.fill;

    for (double y = 0; y < size.height; y += _px) {
      for (double x = 0; x < size.width; x += _px) {
        final v = rng.nextInt(200) + 30; // 30~229 밝기
        final a = rng.nextInt(120) + 80; // 80~199 불투명도
        paint.color = Color.fromARGB(a, v, v, v);
        canvas.drawRect(Rect.fromLTWH(x, y, _px, _px), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_NoisePainter old) => old.seed != seed;
}

/// 가로 스캔라인 — TV 화면 특유의 줄무늬
class _ScanlinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black.withValues(alpha: 0.18)
      ..style = PaintingStyle.fill;
    for (double y = 0; y < size.height; y += 4) {
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, 2), paint);
    }
  }

  @override
  bool shouldRepaint(_ScanlinePainter _) => false;
}
