import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/user.dart';

class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key, required this.user});

  final User user;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Text(
            '관심 상품',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ),
        const Expanded(child: _EmptyState()),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: const [
          Icon(
            Icons.favorite_outline,
            size: 48,
            color: AppColors.inkMute,
          ),
          SizedBox(height: 12),
          Text(
            '관심 상품이 없어요',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.inkMute,
            ),
          ),
        ],
      ),
    );
  }
}
