import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/auction.dart';
import '../../models/user.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';
import '../live/live_screen.dart';
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
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => LiveScreen(
          auction: auction,
          user: widget.user,
          liveToken: tokenData['token'] as String,
          serverUrl: tokenData['serverUrl'] as String,
        ),
      ));
      _load(); // refresh after returning
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('입장 실패: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('바로팜', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
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
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _auctions.isEmpty
              ? Center(
                  child: Text('진행 중인 경매가 없어요',
                      style: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(color: AppColors.inkMute)),
                )
              : RefreshIndicator(
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
                ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (i) => setState(() => _navIndex = i),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.accentSoft,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: '홈'),
          NavigationDestination(icon: Icon(Icons.gavel_outlined), label: '경매'),
          NavigationDestination(icon: Icon(Icons.favorite_outline), label: '관심'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '내정보'),
        ],
      ),
    );
  }
}
