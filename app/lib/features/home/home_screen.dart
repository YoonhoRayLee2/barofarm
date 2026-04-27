import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/auction.dart';
import '../../models/user.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';
import '../../utils/responsive.dart';
import '../live/buyer_live_screen.dart';
import '../live/live_screen.dart';
import '../live/sample_auction_screen.dart';
import '../seller/create_auction_screen.dart';
import 'widgets/auction_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.user});
  final User user;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Auction> _auctions = [];
  bool _loading = true;
  int _navIndex = 0;

  @override
  void initState() {
    super.initState();
    SocketService().connect();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final auctions = await ApiService().getAuctions();
      if (mounted) setState(() => _auctions = auctions);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('경매 목록을 불러오지 못했어요: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openLive(Auction auction) async {
    try {
      final tokenData = await ApiService().getToken(
        roomName: auction.id,
        userId: widget.user.id,
        role: widget.user.role,
      );
      if (!mounted) return;

      final isBuyer = widget.user.role == 'buyer';
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => isBuyer
            ? BuyerLiveScreen(
                auction: auction,
                user: widget.user,
                liveToken: tokenData['token'] as String,
                serverUrl: tokenData['serverUrl'] as String,
              )
            : LiveScreen(
                auction: auction,
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

  Future<void> _openCreateAuction() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CreateAuctionScreen(user: widget.user),
    ));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final isSeller = widget.user.role == 'seller';
    final wide = !context.isMobile;

    final scaffold = Scaffold(
      appBar: wide ? null : _buildMobileAppBar(),
      body: wide ? _buildWideBody() : _buildMobileBody(),
      floatingActionButton: isSeller
          ? FloatingActionButton(
              onPressed: _openCreateAuction,
              backgroundColor: AppColors.primary,
              foregroundColor: AppColors.primaryInk,
              child: const Icon(Icons.add),
            )
          : null,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _navIndex,
              onDestinationSelected: (i) => setState(() => _navIndex = i),
              backgroundColor: AppColors.surface,
              indicatorColor: AppColors.primarySoft,
              destinations: const [
                NavigationDestination(
                    icon: Icon(Icons.home_outlined), label: '홈'),
                NavigationDestination(
                    icon: Icon(Icons.gavel_outlined), label: '경매'),
                NavigationDestination(
                    icon: Icon(Icons.favorite_outline), label: '관심'),
                NavigationDestination(
                    icon: Icon(Icons.person_outline), label: '내정보'),
              ],
            ),
    );

    return scaffold;
  }

  // ─── Mobile ─────────────────────────────────────────────────────────────────
  PreferredSizeWidget _buildMobileAppBar() {
    return AppBar(
      title: const Text('바로팜', style: TextStyle(fontWeight: FontWeight.w700)),
      actions: [
        IconButton(
          icon: const Icon(Icons.play_circle_outline),
          tooltip: '데모 경매',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SampleAuctionScreen()),
          ),
        ),
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Center(
            child: Text(
              widget.user.name,
              style: const TextStyle(fontSize: 14, color: AppColors.inkSoft),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMobileBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_auctions.isEmpty) {
      return Center(
        child: Text(
          '진행 중인 경매가 없어요',
          style: Theme.of(context)
              .textTheme
              .bodyLarge
              ?.copyWith(color: AppColors.inkMute),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _auctions.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => AuctionCard(
          auction: _auctions[i],
          onTap: () => _openLive(_auctions[i]),
        ),
      ),
    );
  }

  // ─── Tablet/Desktop ─────────────────────────────────────────────────────────
  Widget _buildWideBody() {
    return Row(
      children: [
        NavigationRail(
          selectedIndex: _navIndex,
          onDestinationSelected: (i) => setState(() => _navIndex = i),
          labelType: NavigationRailLabelType.all,
          backgroundColor: AppColors.surface,
          indicatorColor: AppColors.primarySoft,
          selectedIconTheme: const IconThemeData(color: AppColors.primary),
          selectedLabelTextStyle: const TextStyle(
            color: AppColors.primary,
            fontWeight: FontWeight.w700,
          ),
          unselectedIconTheme: const IconThemeData(color: AppColors.inkSoft),
          unselectedLabelTextStyle:
              const TextStyle(color: AppColors.inkSoft),
          leading: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
            child: Column(
              children: [
                const Text(
                  '바로팜',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.user.name,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.inkMute),
                ),
              ],
            ),
          ),
          trailing: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: IconButton(
              icon: const Icon(Icons.refresh, color: AppColors.inkSoft),
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
              icon: Icon(Icons.favorite_outline),
              selectedIcon: Icon(Icons.favorite),
              label: Text('관심'),
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
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_auctions.isEmpty) {
      return Center(
        child: Text(
          '진행 중인 경매가 없어요',
          style: Theme.of(context)
              .textTheme
              .bodyLarge
              ?.copyWith(color: AppColors.inkMute),
        ),
      );
    }
    final crossAxisCount = context.isDesktop ? 3 : 2;
    return RefreshIndicator(
      onRefresh: _load,
      child: GridView.builder(
        padding: const EdgeInsets.all(24),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          childAspectRatio: 0.78,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: _auctions.length,
        itemBuilder: (_, i) => AuctionCard(
          auction: _auctions[i],
          onTap: () => _openLive(_auctions[i]),
        ),
      ),
    );
  }
}
