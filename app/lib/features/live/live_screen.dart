import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../app_theme.dart';
import '../../models/auction.dart';
import '../../models/live.dart';
import '../../models/message.dart';
import '../../models/user.dart';
import '../../app_config.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';
import '../../utils/responsive.dart';
import 'widgets/live_badge.dart';
import 'widgets/timer_display.dart';
import 'widgets/chat_overlay.dart';
import 'widgets/bid_chips.dart';
import 'widgets/slide_bid.dart';
import 'widgets/static_noise_overlay.dart';
import 'widgets/live_view/live_view_widget.dart';

class LiveScreen extends StatefulWidget {
  const LiveScreen({
    super.key,
    required this.live,
    required this.user,
    required this.liveToken,
    required this.serverUrl,
  });

  final Live live;
  final User user;
  final String liveToken;
  final String serverUrl;

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  late final String _liveUrl;
  Auction? _auction;
  final List<ChatMessage> _messages = [];
  final List<StreamSubscription> _subs = [];

  int _bidAmount = 0;
  bool _auctionEnded = false;
  bool _streamLost = false;
  int _viewerCount = 0;
  String? _winnerName;
  int? _winnerPrice;

  final _productNameCtrl = TextEditingController();
  final _startPriceCtrl = TextEditingController();
  bool _creatingAuction = false;

  @override
  void initState() {
    super.initState();
    _auction = widget.live.currentAuction;
    if (_auction != null) {
      _bidAmount = _auction!.currentPrice + 1000;
    }
    _subscribeSocket();
    _liveUrl = _buildLiveUrl();
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _productNameCtrl.dispose();
    _startPriceCtrl.dispose();
    super.dispose();
  }

  String _buildLiveUrl() {
    return '${AppConfig.baseUrl}/live/live-seller.html'
        '?serverUrl=${Uri.encodeQueryComponent(widget.serverUrl)}'
        '&token=${Uri.encodeQueryComponent(widget.liveToken)}';
  }

  void _onWebViewMessage(String message) {
    if (!mounted) return;
    switch (message) {
      case 'onLiveStart':
        setState(() => _streamLost = false);
      case 'onLiveEnd':
        Navigator.of(context).pop();
      case 'onLiveError':
        setState(() => _streamLost = true);
    }
  }

  void _subscribeSocket() {
    final socket = SocketService();
    socket.join(widget.live.id);

    _subs.add(socket.onAuctionUpdate.listen((data) {
      if (!mounted) return;
      setState(() {
        if (_auction == null) {
          _auction = Auction.fromJson(Map<String, dynamic>.from(data));
        } else {
          _auction = _auction!.copyWith(
            currentPrice:
                (data['currentPrice'] as num?)?.toInt() ?? _auction!.currentPrice,
            topBidder: data['topBidder'] as String?,
            timeLeft: (data['timeLeft'] as num?)?.toInt(),
            status: data['status'] as String?,
          );
        }
        _bidAmount = (_auction?.currentPrice ?? 0) + 1000;
      });
    }));

    _subs.add(socket.onAuctionEnded.listen((data) {
      if (!mounted) return;
      setState(() {
        _auctionEnded = true;
        _winnerName = data['winnerName'] as String?;
        _winnerPrice = (data['price'] as num?)?.toInt();
      });
    }));

    _subs.add(socket.onViewerCount.listen((count) {
      if (mounted) setState(() => _viewerCount = count);
    }));

    _subs.add(socket.onChatMessage.listen((msg) {
      if (!mounted) return;
      setState(() => _messages.add(msg));
    }));
  }

  void _onBid() {
    final auction = _auction;
    if (auction == null) return;
    SocketService().bid(widget.live.id, auction.id, _bidAmount, widget.user.id, widget.user.name);
  }

  Future<void> _showAddAuctionSheet() async {
    _productNameCtrl.clear();
    _startPriceCtrl.clear();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AddAuctionSheet(
        productNameCtrl: _productNameCtrl,
        startPriceCtrl: _startPriceCtrl,
        creatingAuction: _creatingAuction,
        onStart: _createAndStartAuction,
      ),
    );
  }

  Future<void> _createAndStartAuction() async {
    final name = _productNameCtrl.text.trim();
    final price = int.tryParse(_startPriceCtrl.text.trim()) ?? 0;
    if (name.isEmpty || price <= 0) return;

    setState(() => _creatingAuction = true);
    try {
      final auction = await ApiService().createAuction(
        liveId: widget.live.id,
        productName: name,
        startPrice: price,
      );
      await ApiService().startAuction(
        liveId: widget.live.id,
        auctionId: auction.id,
      );
      if (!mounted) return;
      setState(() {
        _auction = auction;
        _bidAmount = auction.currentPrice + 1000;
        _creatingAuction = false;
      });
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _creatingAuction = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('경매 등록 실패: $e')),
      );
    }
  }

  String _formatPrice(int p) => p.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: true,
      floatingActionButton: _auction == null
          ? FloatingActionButton.extended(
              onPressed: _showAddAuctionSheet,
              backgroundColor: AppColors.cta,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('경매 등록', style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
      body: ResponsiveLayout(
        mobile: _buildMobile(context),
        tablet: _buildWide(context),
        desktop: _buildWide(context),
      ),
    );
  }

  // ─── Mobile (full-screen overlays) ──────────────────────────────────────────
  Widget _buildMobile(BuildContext context) {
    return Stack(
      children: [
        // L0: WebView/iframe — full screen live video
        Positioned.fill(
          child: LiveViewWidget(url: _liveUrl, onMessage: _onWebViewMessage),
        ),

        // L0-1: 스트림 유실 노이즈 오버레이
        if (_streamLost) const Positioned.fill(child: StaticNoiseOverlay()),

        // L1: top overlay — LIVE badge + product name + timer
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: _buildTopRow(),
            ),
          ),
        ),

        if (_auction != null) ...[
          // L2: chat overlay (mid-left)
          Positioned(
            left: 0,
            right: 80,
            bottom: 200,
            height: 240,
            child: ChatOverlay(messages: _messages),
          ),

          // L3: current price
          Positioned(
            left: 16,
            bottom: 160,
            child: _buildPriceBlock(),
          ),
        ],

        if (_auction == null)
          Positioned(
            bottom: 120,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  '경매를 시작하세요',
                  style: TextStyle(color: Colors.white70, fontSize: 15),
                ),
              ),
            ),
          ),

        // Auction ended overlay
        if (_auctionEnded) Positioned.fill(child: _buildEndedOverlay()),
      ],
    );
  }

  // ─── Tablet/Desktop (split layout: video + side panel) ──────────────────────
  Widget _buildWide(BuildContext context) {
    final sidePanelWidth = context.isDesktop ? 380.0 : 320.0;

    return Row(
      children: [
        // Left: live video + minimal overlays
        Expanded(
          flex: 3,
          child: Stack(
            children: [
              Positioned.fill(
                child: LiveViewWidget(
                    url: _liveUrl, onMessage: _onWebViewMessage),
              ),
              if (_streamLost)
                const Positioned.fill(child: StaticNoiseOverlay()),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: _buildTopRow(),
                  ),
                ),
              ),
              if (_auctionEnded)
                Positioned.fill(child: _buildEndedOverlay()),
            ],
          ),
        ),
        // Right: side panel with price, chat, bid
        Container(
          width: sidePanelWidth,
          color: AppColors.surface,
          child: SafeArea(
            left: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: _buildPriceBlock(onDark: false),
                ),
                const Divider(height: 1, color: AppColors.line),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                    child: ChatOverlay(messages: _messages),
                  ),
                ),
                if (_auction != null && !_auctionEnded)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: const BoxDecoration(
                      border: Border(
                          top: BorderSide(color: AppColors.line, width: 1)),
                    ),
                    child: _buildBidColumn(),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ─── Shared building blocks ─────────────────────────────────────────────────
  Widget _buildTopRow() {
    return Row(
      children: [
        const LiveBadge(),
        const SizedBox(width: 8),
        if (_viewerCount > 0) ...[
          const Icon(Icons.visibility, color: Colors.white60, size: 13),
          const SizedBox(width: 2),
          Text(
            '$_viewerCount',
            style: const TextStyle(color: Colors.white60, fontSize: 13),
          ),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Text(
            _auction?.productName ?? widget.live.title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              shadows: [Shadow(blurRadius: 4)],
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (_auction?.timeLeft != null)
          TimerDisplay(timeLeft: _auction!.timeLeft!),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.black45,
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Icon(Icons.close, color: Colors.white, size: 20),
          ),
        ),
      ],
    );
  }

  Widget _buildPriceBlock({bool onDark = true}) {
    final auction = _auction;
    if (auction == null) return const SizedBox.shrink();
    final ink = onDark ? Colors.white : AppColors.ink;
    final sub = onDark ? Colors.white70 : AppColors.inkMute;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '${_formatPrice(auction.currentPrice)}원',
          style: TextStyle(
            color: ink,
            fontSize: 32,
            fontWeight: FontWeight.w900,
            shadows: onDark ? const [Shadow(blurRadius: 6)] : null,
          ),
        ),
        if (auction.topBidder != null)
          Text(
            '최고 입찰자: ${auction.topBidder}',
            style: TextStyle(color: sub, fontSize: 12),
          ),
      ],
    );
  }

  Widget _buildBidColumn() {
    final auction = _auction;
    if (auction == null) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        BidChips(
          currentPrice: auction.currentPrice,
          onSelect: (price) => setState(() => _bidAmount = price),
        ),
        const SizedBox(height: 8),
        SlideBid(
          amount: _bidAmount,
          onConfirm: _onBid,
        ),
      ],
    );
  }

  Widget _buildEndedOverlay() {
    final auction = _auction;
    return Container(
      color: Colors.black54,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.gavel, color: Colors.white, size: 48),
            const SizedBox(height: 16),
            const Text(
              '경매 종료',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (auction != null) ...[
              const SizedBox(height: 8),
              Text(
                '최종 낙찰가: ${_formatPrice(auction.currentPrice)}원',
                style: const TextStyle(color: Colors.white70, fontSize: 16),
              ),
              if (auction.topBidder != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '낙찰자: ${auction.topBidder}',
                    style: const TextStyle(color: Colors.white70, fontSize: 14),
                  ),
                ),
            ],
            if (_winnerName != null) ...[
              const SizedBox(height: 4),
              Text('낙찰자: $_winnerName', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
            ],
            if (_winnerPrice != null) ...[
              const SizedBox(height: 2),
              Text('낙찰금액: ${_formatPrice(_winnerPrice!)}원', style: const TextStyle(fontSize: 14, color: Colors.white70)),
            ],
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: const Text('나가기',
                  style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Add Auction Sheet ───────────────────────────────────────────────────────
class _AddAuctionSheet extends StatelessWidget {
  const _AddAuctionSheet({
    required this.productNameCtrl,
    required this.startPriceCtrl,
    required this.creatingAuction,
    required this.onStart,
  });

  final TextEditingController productNameCtrl;
  final TextEditingController startPriceCtrl;
  final bool creatingAuction;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 10, bottom: 20),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const Text(
              '경매 등록',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: productNameCtrl,
              decoration: const InputDecoration(hintText: '상품명'),
              style: const TextStyle(color: AppColors.ink),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: startPriceCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                hintText: '시작가',
                suffixText: '원',
                suffixStyle: TextStyle(color: AppColors.inkMute),
              ),
              style: const TextStyle(color: AppColors.ink),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: creatingAuction ? null : onStart,
              child: creatingAuction
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('경매 시작'),
            ),
          ],
        ),
      ),
    );
  }
}
