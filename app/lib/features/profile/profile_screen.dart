import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/user.dart';
import '../../widgets/group_card.dart';
import 'settings_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.user,
    required this.onLogout,
  });

  final User user;
  final VoidCallback onLogout;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  int _profileTab = 0;

  void _showComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('준비 중이에요')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 16),
          _buildStats(),
          const SizedBox(height: 12),
          _buildSegmentedTabs(),
          const SizedBox(height: 24),
          _buildSellerGroup(),
          const SizedBox(height: 16),
          _buildAccountGroup(),
          const SizedBox(height: 32),
          const SafeArea(top: false, child: SizedBox.shrink()),
        ],
      ),
    );
  }

  // ─── Profile Header ──────────────────────────────────────────────────────────
  Widget _buildHeader() {
    final initial = widget.user.name.isNotEmpty ? widget.user.name[0] : '?';
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: const BoxDecoration(
            color: AppColors.accentSoft,
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            initial,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.user.name,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '@${widget.user.phone}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.inkMute,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.settings_outlined, size: 22, color: AppColors.inkMute),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SettingsScreen()),
          ),
        ),
      ],
    );
  }

  // ─── Stats Row ───────────────────────────────────────────────────────────────
  Widget _buildStats() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          _StatItem(label: '판매', value: '0'),
          _statDivider(),
          _StatItem(label: '평점', value: '-'),
          _statDivider(),
          _StatItem(label: '팔로워', value: '0'),
        ],
      ),
    );
  }

  Widget _statDivider() => Container(
        width: 1,
        height: 32,
        color: AppColors.line,
        margin: const EdgeInsets.symmetric(horizontal: 16),
      );

  // ─── Segmented Tabs ──────────────────────────────────────────────────────────
  Widget _buildSegmentedTabs() {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _SegTab(label: '컬렉터', index: 0, selected: _profileTab == 0, onTap: () => setState(() => _profileTab = 0)),
          _SegTab(label: '딜러', index: 1, selected: _profileTab == 1, onTap: () => setState(() => _profileTab = 1)),
        ],
      ),
    );
  }

  // ─── Seller Group ────────────────────────────────────────────────────────────
  Widget _buildSellerGroup() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 10),
          child: Text(
            '판매 관리',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
        ),
        GroupCard(
          children: [
            GroupRow(
              icon: Icons.local_shipping_outlined,
              title: '배송 정책 설정',
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.account_balance_outlined,
              title: '정산 계좌 관리',
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.receipt_outlined,
              title: '판매 대금 정산 내역',
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.assignment_return_outlined,
              title: '반품 신청 문의',
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.replay_outlined,
              title: '재결제 대기중 목록',
              onTap: _showComingSoon,
            ),
          ],
        ),
      ],
    );
  }

  // ─── Account Group ───────────────────────────────────────────────────────────
  Widget _buildAccountGroup() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 10),
          child: Text(
            '계정',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
        ),
        GroupCard(
          children: [
            GroupRow(
              icon: Icons.gavel_outlined,
              title: '내 경매 내역',
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.link_outlined,
              title: '내 상점 URL 설정',
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.emoji_events_outlined,
              title: '위클리 라이브 미션',
              showChevron: false,
              trailing: const _EventBadge(),
              onTap: _showComingSoon,
            ),
            GroupRow(
              icon: Icons.settings_outlined,
              title: '앱 설정',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              ),
            ),
            GroupRow(
              icon: Icons.logout,
              title: '로그아웃',
              titleColor: AppColors.danger,
              iconColor: AppColors.danger,
              showChevron: false,
              onTap: widget.onLogout,
            ),
          ],
        ),
      ],
    );
  }
}

// ─── Segmented Tab ───────────────────────────────────────────────────────────
class _SegTab extends StatelessWidget {
  const _SegTab({
    required this.label,
    required this.index,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int index;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: selected ? AppColors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? AppColors.ink : AppColors.inkMute,
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Event Badge ─────────────────────────────────────────────────────────────
class _EventBadge extends StatelessWidget {
  const _EventBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.warn,
        borderRadius: BorderRadius.circular(99),
      ),
      child: const Text(
        'EVENT',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.black),
      ),
    );
  }
}

// ─── Stat Item ───────────────────────────────────────────────────────────────
class _StatItem extends StatelessWidget {
  const _StatItem({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.inkMute),
          ),
        ],
      ),
    );
  }
}
