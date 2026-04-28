import 'dart:async';
import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/live.dart';
import '../../models/user.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';
import '../../utils/responsive.dart';
import '../../features/chat/chat_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../auth/login_screen.dart';
import '../live/buyer_live_screen.dart';
import '../live/live_screen.dart';
import '../live/sample_auction_screen.dart';
import 'widgets/auction_card.dart';
import 'widgets/fab_bottom_sheet.dart';
import 'widgets/story_ring.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.user});
  final User user;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Live> _lives = [];
  bool _loading = true;
  int _navIndex = 0;
  int _categoryIndex = 0;
  int _auctionTabIndex = 0;
  final List<StreamSubscription> _subs = [];

  static const _categories = ['전체', '과일', '채소', '곡물', '수산', '축산'];
  static const _auctionTabs = ['지금 경매', '예고', '곧 마감'];

  @override
  void initState() {
    super.initState();
    SocketService().connect();
    _subscribeSocketLobby();
    _load();
  }

  @override
  void dispose() {
    for (final s in _subs) { s.cancel(); }
    super.dispose();
  }

  void _subscribeSocketLobby() {
    final socket = SocketService();
    _subs.add(socket.onLobbyLiveNew.listen((data) {
      final live = Live.fromJson(data);
      if (!mounted) return;
      setState(() {
        if (!_lives.any((l) => l.id == live.id)) {
          _lives = [live, ..._lives];
        }
      });
    }));
    _subs.add(socket.onLobbyLiveEnded.listen((data) {
      if (!mounted) return;
      setState(() {
        _lives = _lives.where((l) => l.id != data['id'].toString()).toList();
      });
    }));
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final lives = await ApiService().getLives();
      if (mounted) setState(() => _lives = lives);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('라이브 목록을 불러오지 못했어요: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openLive(Live live) async {
    try {
      final isSeller = live.sellerId == widget.user.id;
      final tokenData = await ApiService().getToken(
        roomName: live.id,
        userId: widget.user.id,
        role: isSeller ? 'seller' : 'buyer',
      );
      if (!mounted) return;

      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => isSeller
            ? LiveScreen(
                live: live,
                user: widget.user,
                liveToken: tokenData['token'] as String,
                serverUrl: tokenData['serverUrl'] as String,
              )
            : BuyerLiveScreen(
                live: live,
                user: widget.user,
                liveToken: tokenData['token'] as String,
                serverUrl: tokenData['serverUrl'] as String,
              ),
      ));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('입장 실패: $e')),
      );
    }
  }

  Future<void> _openFabSheet() async {
    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => FabBottomSheet(user: widget.user, onRefresh: _load),
    );
  }

  void _handleLogout() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = !context.isMobile;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: wide ? null : _buildMobileAppBar(),
      body: wide ? _buildWideBody() : _buildMobileBody(),
      bottomNavigationBar: wide ? null : _buildBottomTabBar(),
    );
  }

  // ─── AppBar ─────────────────────────────────────────────────────────────────
  PreferredSizeWidget _buildMobileAppBar() {
    return AppBar(
      backgroundColor: AppColors.bg,
      elevation: 0,
      title: Image.asset(
        'assets/barofarm_home_logo.png',
        height: 36,
        fit: BoxFit.contain,
        alignment: Alignment.centerLeft,
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.play_circle_outline, color: AppColors.inkMute),
          tooltip: '데모 경매',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SampleAuctionScreen()),
          ),
        ),
        IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.inkMute),
            onPressed: _load),
        Padding(
          padding: const EdgeInsets.only(right: 14),
          child: Center(
            child: Text(
              widget.user.name,
              style: const TextStyle(fontSize: 13, color: AppColors.inkMute),
            ),
          ),
        ),
      ],
    );
  }

  // ─── Bottom Tab Bar ──────────────────────────────────────────────────────────
  Widget _buildBottomTabBar() {
    return Container(
      height: 84,
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(top: BorderSide(color: AppColors.surface, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _TabItem(
              icon: Icons.home_outlined,
              activeIcon: Icons.home,
              label: '홈',
              active: _navIndex == 0,
              onTap: () => setState(() => _navIndex = 0),
            ),
            _TabItem(
              icon: Icons.shopping_bag_outlined,
              activeIcon: Icons.shopping_bag,
              label: '경매',
              active: _navIndex == 1,
              onTap: () => setState(() => _navIndex = 1),
            ),
            // Center FAB
            GestureDetector(
              onTap: _openFabSheet,
              child: Container(
                width: 46,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.cta,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.cta.withValues(alpha: 0.45),
                      blurRadius: 14,
                      spreadRadius: -4,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.add, color: Colors.white, size: 22),
              ),
            ),
            _TabItem(
              icon: Icons.chat_bubble_outline,
              activeIcon: Icons.chat_bubble,
              label: '채팅',
              active: _navIndex == 3,
              onTap: () => setState(() => _navIndex = 3),
            ),
            _TabItem(
              icon: Icons.person_outline,
              activeIcon: Icons.person,
              label: '내정보',
              active: _navIndex == 4,
              onTap: () => setState(() => _navIndex = 4),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Category Pills ──────────────────────────────────────────────────────────
  Widget _buildCategoryTabs() {
    return SizedBox(
      height: 90,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) => StoryRing(
          label: _categories[i],
          isActive: _categoryIndex == i,
          onTap: () => setState(() => _categoryIndex = i),
        ),
      ),
    );
  }

  // ─── Auction Status Sub-tabs ─────────────────────────────────────────────────
  Widget _buildAuctionSubTabs() {
    return SizedBox(
      height: 38,
      child: Row(
        children: List.generate(_auctionTabs.length, (i) {
          final active = _auctionTabIndex == i;
          return GestureDetector(
            onTap: () => setState(() => _auctionTabIndex = i),
            child: Padding(
              padding: EdgeInsets.only(
                left: i == 0 ? 16 : 20,
                right: i == _auctionTabs.length - 1 ? 16 : 0,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    _auctionTabs[i],
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                      color: active ? AppColors.ink : AppColors.inkMute,
                    ),
                  ),
                  const SizedBox(height: 3),
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    height: 2,
                    width: active ? _auctionTabs[i].length * 8.0 : 0,
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      borderRadius: BorderRadius.circular(1),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }

  // ─── Mobile Body ─────────────────────────────────────────────────────────────
  Widget _buildMobileBody() {
    if (_navIndex == 3) {
      return ChatScreen(user: widget.user);
    }
    if (_navIndex == 4) {
      return ProfileScreen(user: widget.user, onLogout: _handleLogout);
    }
    return Column(
      children: [
        _buildCategoryTabs(),
        const SizedBox(height: 4),
        _buildAuctionSubTabs(),
        const SizedBox(height: 4),
        Expanded(child: _buildAuctionList()),
      ],
    );
  }

  Widget _buildAuctionList() {
    if (_loading) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.accent));
    }
    if (_lives.isEmpty) {
      return Center(
        child: Text(
          '진행 중인 라이브가 없어요',
          style: Theme.of(context)
              .textTheme
              .bodyLarge
              ?.copyWith(color: AppColors.inkMute),
        ),
      );
    }
    return RefreshIndicator(
      color: AppColors.accent,
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _lives.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => LiveCard(
          live: _lives[i],
          onTap: () => _openLive(_lives[i]),
        ),
      ),
    );
  }

  // ─── Tablet/Desktop ──────────────────────────────────────────────────────────
  Widget _buildWideBody() {
    return Row(
      children: [
        NavigationRail(
          selectedIndex: _navIndex > 1 ? _navIndex - 1 : _navIndex,
          onDestinationSelected: (i) {
            // Map rail indices: 0->홈, 1->경매, 2->관심(3), 3->내정보(4)
            final mapped = i >= 2 ? i + 1 : i;
            setState(() => _navIndex = mapped);
          },
          labelType: NavigationRailLabelType.all,
          backgroundColor: AppColors.surface,
          indicatorColor: Colors.transparent,
          selectedIconTheme: const IconThemeData(color: AppColors.ink),
          selectedLabelTextStyle: const TextStyle(
            color: AppColors.ink,
            fontWeight: FontWeight.w700,
          ),
          unselectedIconTheme: const IconThemeData(color: AppColors.inkMute),
          unselectedLabelTextStyle:
              const TextStyle(color: AppColors.inkMute),
          leading: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
            child: Column(
              children: [
                Image.asset(
                  'assets/barofarm_logo.png',
                  height: 28,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 4),
                Text(
                  widget.user.name,
                  style: const TextStyle(fontSize: 11, color: AppColors.inkMute),
                ),
              ],
            ),
          ),
          trailing: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: IconButton(
              icon: const Icon(Icons.refresh, color: AppColors.inkMute),
              onPressed: _load,
              tooltip: '새로고침',
            ),
          ),
          destinations: const [
            NavigationRailDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: Text('홈'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.gavel_outlined),
              selectedIcon: Icon(Icons.gavel),
              label: Text('경매'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.chat_bubble_outline),
              selectedIcon: Icon(Icons.chat_bubble),
              label: Text('채팅'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: Text('내정보'),
            ),
          ],
        ),
        const VerticalDivider(thickness: 1, width: 1, color: AppColors.line),
        Expanded(child: _buildWideContent()),
      ],
    );
  }

  Widget _buildWideContent() {
    if (_navIndex == 3) {
      return ChatScreen(user: widget.user);
    }
    if (_navIndex == 4) {
      return ProfileScreen(user: widget.user, onLogout: _handleLogout);
    }
    if (_loading) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.accent));
    }
    if (_lives.isEmpty) {
      return Center(
        child: Text(
          '진행 중인 라이브가 없어요',
          style: Theme.of(context)
              .textTheme
              .bodyLarge
              ?.copyWith(color: AppColors.inkMute),
        ),
      );
    }
    final crossAxisCount = context.isDesktop ? 3 : 2;
    return RefreshIndicator(
      color: AppColors.accent,
      onRefresh: _load,
      child: GridView.builder(
        padding: const EdgeInsets.all(24),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          childAspectRatio: 0.78,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: _lives.length,
        itemBuilder: (_, i) => LiveCard(
          live: _lives[i],
          onTap: () => _openLive(_lives[i]),
        ),
      ),
    );
  }
}

// ─── Tab Item ───────────────────────────────────────────────────────────────
class _TabItem extends StatelessWidget {
  const _TabItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.active,
    required this.onTap,
  });
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              active ? activeIcon : icon,
              size: 22,
              color: active ? AppColors.ink : AppColors.inkMute,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: active ? AppColors.ink : AppColors.inkMute,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
