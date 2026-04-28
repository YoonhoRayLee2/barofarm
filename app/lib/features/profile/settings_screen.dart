import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../widgets/group_card.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _salesPublic = true;
  bool _marketingEnabled = true;
  bool _nightMarketingEnabled = false;

  void _showComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('준비 중이에요')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text(
          '설정',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.ink),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppColors.inkSoft),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ─── 공개 범위 ─────────────────────────────────────────────────────
          const Text(
            '공개 범위',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
          const SizedBox(height: 10),
          GroupCard(
            children: [
              GroupRow(
                icon: Icons.visibility_outlined,
                title: '판매 내역 공개',
                subtitle: '내 판매 내역을 프로필 페이지에 공개합니다',
                showChevron: false,
                trailing: Switch(
                  value: _salesPublic,
                  activeColor: AppColors.accent,
                  onChanged: (v) => setState(() => _salesPublic = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ─── 앱 푸시 알림 ────────────────────────────────────────────────
          const Text(
            '앱 푸시 알림',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
          const SizedBox(height: 10),
          GroupCard(
            children: [
              GroupRow(
                icon: Icons.notifications_outlined,
                title: '마케팅 수신 동의',
                showChevron: false,
                trailing: Switch(
                  value: _marketingEnabled,
                  activeColor: AppColors.accent,
                  onChanged: (v) => setState(() => _marketingEnabled = v),
                ),
              ),
              GroupRow(
                icon: Icons.nightlight_outlined,
                title: '야간 마케팅 수신 동의',
                showChevron: false,
                trailing: Switch(
                  value: _nightMarketingEnabled,
                  activeColor: AppColors.accent,
                  onChanged: (v) => setState(() => _nightMarketingEnabled = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ─── 기타 ─────────────────────────────────────────────────────────
          const Text(
            '기타',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
          const SizedBox(height: 10),
          GroupCard(
            children: [
              GroupRow(
                icon: Icons.headset_mic_outlined,
                title: '문의하기',
                onTap: _showComingSoon,
              ),
              GroupRow(
                icon: Icons.security_outlined,
                title: '앱 권한 설정',
                onTap: _showComingSoon,
              ),
              GroupRow(
                icon: Icons.person_remove_outlined,
                title: '회원탈퇴',
                titleColor: AppColors.danger,
                iconColor: AppColors.danger,
                onTap: _showComingSoon,
              ),
            ],
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
