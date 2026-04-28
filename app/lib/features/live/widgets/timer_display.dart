import 'package:flutter/material.dart';
import '../../../app_theme.dart';

class TimerDisplay extends StatefulWidget {
  const TimerDisplay({super.key, required this.timeLeft});
  final int timeLeft;

  @override
  State<TimerDisplay> createState() => _TimerDisplayState();
}

class _TimerDisplayState extends State<TimerDisplay> with SingleTickerProviderStateMixin {
  late final AnimationController _shakeCtrl;
  late final Animation<Offset> _shakeAnim;

  @override
  void initState() {
    super.initState();
    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _shakeAnim = TweenSequence<Offset>([
      TweenSequenceItem(tween: Tween(begin: Offset.zero, end: const Offset(0.05, 0)), weight: 1),
      TweenSequenceItem(tween: Tween(begin: const Offset(0.05, 0), end: const Offset(-0.05, 0)), weight: 2),
      TweenSequenceItem(tween: Tween(begin: const Offset(-0.05, 0), end: Offset.zero), weight: 1),
    ]).animate(CurvedAnimation(parent: _shakeCtrl, curve: Curves.easeInOut));
  }

  @override
  void didUpdateWidget(TimerDisplay old) {
    super.didUpdateWidget(old);
    if (old.timeLeft > 3 && widget.timeLeft <= 3) {
      _shakeCtrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _shakeCtrl.dispose();
    super.dispose();
  }

  Color get _color {
    if (widget.timeLeft <= 3) return AppColors.danger;
    if (widget.timeLeft <= 10) return AppColors.warning;
    return AppColors.success;
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _shakeAnim,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.black45,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          _formatTime(widget.timeLeft),
          style: TextStyle(
            color: _color,
            fontSize: 16,
            fontWeight: FontWeight.w900,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }

  String _formatTime(int s) {
    if (s <= 0) return '0:00';
    final m = s ~/ 60;
    final sec = s % 60;
    return '$m:${sec.toString().padLeft(2, '0')}';
  }
}
