import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/user.dart';
import 'live_create2_screen.dart';

class LiveCreate1Screen extends StatefulWidget {
  const LiveCreate1Screen({super.key, required this.user});
  final User user;

  @override
  State<LiveCreate1Screen> createState() => _LiveCreate1ScreenState();
}

class _LiveCreate1ScreenState extends State<LiveCreate1Screen> {
  String? _selectedCategory;
  final _titleCtrl = TextEditingController();
  final _msgCtrl = TextEditingController();
  bool _agreed = false;

  static const _categories = ['과일', '채소', '곡물', '수산', '축산', '기타'];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _msgCtrl.dispose();
    super.dispose();
  }

  void _onNext() {
    if (_titleCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('라이브 제목을 입력해주세요')),
      );
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => LiveCreate2Screen(user: widget.user),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text(
          '라이브 만들기',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.ink),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppColors.inkSoft),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Info banner
                _InfoBanner(
                  icon: Icons.info_outline,
                  text: '라이브 방송 전 미리 상품 정보를 입력해두면 더 원활한 진행이 가능해요.',
                ),
                const SizedBox(height: 20),

                // Upload tiles
                const Text(
                  '미디어',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _UploadTile(icon: Icons.image_outlined, label: '이미지'),
                    const SizedBox(width: 10),
                    _UploadTile(icon: Icons.videocam_outlined, label: '영상'),
                  ],
                ),
                const SizedBox(height: 20),

                // Category select
                const Text(
                  '카테고리',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: _showCategorySheet,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _selectedCategory ?? '카테고리를 선택하세요',
                            style: TextStyle(
                              fontSize: 14,
                              color: _selectedCategory != null ? AppColors.ink : AppColors.inkMute,
                            ),
                          ),
                        ),
                        const Icon(Icons.chevron_right, size: 18, color: AppColors.inkMute),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Title field
                const Text(
                  '라이브 제목',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _titleCtrl,
                  maxLength: 40,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: '라이브 제목을 입력하세요',
                    counterText: '${_titleCtrl.text.length}/40',
                    counterStyle: const TextStyle(fontSize: 11, color: AppColors.inkMute),
                  ),
                  style: const TextStyle(color: AppColors.ink),
                ),
                const SizedBox(height: 20),

                // Entry message
                const Text(
                  '입장 메시지',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _msgCtrl,
                  maxLength: 60,
                  maxLines: 2,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: '시청자 입장 시 표시될 메시지를 입력하세요',
                    counterText: '${_msgCtrl.text.length}/60',
                    counterStyle: const TextStyle(fontSize: 11, color: AppColors.inkMute),
                  ),
                  style: const TextStyle(color: AppColors.ink),
                ),
                const SizedBox(height: 20),

                // Agreement checkbox
                GestureDetector(
                  onTap: () => setState(() => _agreed = !_agreed),
                  child: Row(
                    children: [
                      Container(
                        width: 18,
                        height: 18,
                        decoration: BoxDecoration(
                          color: _agreed ? AppColors.info : Colors.transparent,
                          border: Border.all(
                            color: _agreed ? AppColors.info : AppColors.inkMute,
                            width: 1.5,
                          ),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: _agreed
                            ? const Icon(Icons.check, size: 12, color: Colors.white)
                            : null,
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Text(
                          '라이브 방송 이용약관에 동의합니다',
                          style: TextStyle(fontSize: 13, color: AppColors.inkSoft),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: ElevatedButton(
                onPressed: _onNext,
                child: const Text('다음'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showCategorySheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
        children: _categories.map((c) => ListTile(
          title: Text(c, style: const TextStyle(color: AppColors.ink)),
          trailing: _selectedCategory == c
              ? const Icon(Icons.check, color: AppColors.accent, size: 18)
              : null,
          onTap: () {
            setState(() => _selectedCategory = c);
            Navigator.of(context).pop();
          },
        )).toList(),
      ),
    );
  }
}

class _UploadTile extends StatelessWidget {
  const _UploadTile({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: AspectRatio(
        aspectRatio: 1,
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 28, color: AppColors.inkMute),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontSize: 12, color: AppColors.inkMute)),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.info.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.info.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: AppColors.info),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12, color: AppColors.inkSoft, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}
