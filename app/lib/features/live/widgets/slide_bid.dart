import 'package:flutter/material.dart';
import '../../../app_theme.dart';

class SlideBid extends StatefulWidget {
  const SlideBid({super.key, required this.amount, required this.onConfirm});
  final int amount;
  final VoidCallback onConfirm;

  @override
  State<SlideBid> createState() => _SlideBidState();
}

class _SlideBidState extends State<SlideBid> with SingleTickerProviderStateMixin {
  static const double _trackH = 56.0;
  static const double _thumbW = 56.0;
  static const double _margin = 4.0;

  double _thumbX = 0;
  double _trackWidth = 0;
  bool _confirmed = false;
  late final AnimationController _resetCtrl;
  late Animation<double> _resetAnim;

  double get _maxX => _trackWidth - _thumbW - _margin * 2;
  double get _progress => _trackWidth > _thumbW ? _thumbX / _maxX : 0;

  @override
  void initState() {
    super.initState();
    _resetCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );
  }

  @override
  void dispose() {
    _resetCtrl.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails d) {
    if (_confirmed) return;
    setState(() {
      _thumbX = (_thumbX + d.delta.dx).clamp(0, _maxX);
    });
    if (_thumbX >= _maxX - 2) {
      _confirmed = true;
      widget.onConfirm();
      Future.delayed(const Duration(milliseconds: 1600), _reset);
    }
  }

  void _onDragEnd(DragEndDetails _) {
    if (_confirmed) return;
    _resetAnim = Tween<double>(begin: _thumbX, end: 0).animate(
      CurvedAnimation(parent: _resetCtrl, curve: Curves.easeOutCubic),
    )..addListener(() {
        setState(() => _thumbX = _resetAnim.value);
      });
    _resetCtrl.forward(from: 0);
  }

  void _reset() {
    if (!mounted) return;
    setState(() {
      _thumbX = 0;
      _confirmed = false;
    });
  }

  String _formatPrice(int p) =>
      p.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: LayoutBuilder(
        builder: (_, constraints) {
          _trackWidth = constraints.maxWidth;
          final fillW = (_thumbX + _thumbW).clamp(0.0, _trackWidth);

          return GestureDetector(
            onHorizontalDragUpdate: _onDragUpdate,
            onHorizontalDragEnd: _onDragEnd,
            child: Container(
              height: _trackH,
              decoration: BoxDecoration(
                color: Colors.black38,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white24),
              ),
              child: Stack(
                children: [
                  // fill bar
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 16),
                    width: fillW,
                    height: _trackH,
                    decoration: BoxDecoration(
                      color: _confirmed
                          ? AppColors.success
                          : AppColors.primary.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  // label
                  Center(
                    child: Text(
                      _confirmed ? '입찰 완료!' : '밀어서 ${_formatPrice(widget.amount)}원 입찰',
                      style: TextStyle(
                        color: _progress > 0.4 || _confirmed
                            ? Colors.white
                            : Colors.white70,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  // thumb
                  Positioned(
                    left: _thumbX + _margin,
                    top: _margin,
                    child: Container(
                      width: _thumbW - _margin * 2,
                      height: _trackH - _margin * 2,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: const [
                          BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(1, 1)),
                        ],
                      ),
                      child: const Icon(
                        Icons.chevron_right,
                        color: AppColors.primary,
                        size: 24,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
