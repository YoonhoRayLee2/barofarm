import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../../../models/live.dart';
import '../../../models/user.dart';
import '../../../services/api_service.dart';
import '../../../widgets/group_card.dart';
import '../../live/live_screen.dart';

class FabBottomSheet extends StatelessWidget {
  const FabBottomSheet({
    super.key,
    required this.user,
    required this.onRefresh,
  });

  final User user;
  final VoidCallback onRefresh;

  void _showComingSoon(BuildContext context) {
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('준비 중이에요')),
    );
  }

  Future<void> _openLiveCreate(BuildContext context) async {
    final titleCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text(
          '라이브 만들기',
          style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700),
        ),
        content: TextField(
          controller: titleCtrl,
          autofocus: true,
          style: const TextStyle(color: AppColors.ink),
          decoration: const InputDecoration(
            hintText: '방송 제목을 입력하세요',
            hintStyle: TextStyle(color: AppColors.inkMute),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('취소', style: TextStyle(color: AppColors.inkMute)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('시작', style: TextStyle(color: AppColors.accent)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final title = titleCtrl.text.trim();
    if (title.isEmpty) return;
    if (!context.mounted) return;
    Navigator.of(context).pop();
    try {
      final data = await ApiService().createLive(
        sellerId: user.id,
        title: title,
      );
      if (!context.mounted) return;
      final live = Live(
        id: data['id'].toString(),
        sellerId: user.id,
        title: title,
        status: 'live',
        viewerCount: 0,
        createdAt: '',
      );
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => LiveScreen(
            live: live,
            user: user,
            liveToken: data['token'] as String? ?? '',
            serverUrl: data['serverUrl'] as String? ?? '',
          ),
        ),
      );
      onRefresh();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('라이브 생성 실패: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                margin: const EdgeInsets.only(top: 10, bottom: 16),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Row(
                children: [
                  const Text(
                    '만들기',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceAlt,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: const Icon(
                        Icons.close,
                        size: 16,
                        color: AppColors.inkMute,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // Menu group
              GroupCard(
                children: [
                  GroupRow(
                    icon: Icons.videocam_outlined,
                    title: '라이브 만들기',
                    onTap: () => _openLiveCreate(context),
                  ),
                  GroupRow(
                    icon: Icons.inventory_2_outlined,
                    title: '개별 상품 등록하기',
                    onTap: () => _showComingSoon(context),
                  ),
                  GroupRow(
                    icon: Icons.shopping_bag_outlined,
                    title: '박스 공구 만들기',
                    onTap: () => _showComingSoon(context),
                  ),
                  GroupRow(
                    icon: Icons.chat_bubble_outline,
                    title: '오픈 채팅방 만들기',
                    onTap: () => _showComingSoon(context),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
