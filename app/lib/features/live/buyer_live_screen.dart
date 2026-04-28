import 'dart:async';
import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/auction.dart';
import '../../models/live.dart';
import '../../models/message.dart';
import '../../models/user.dart';
import '../../app_config.dart';
import '../../services/socket_service.dart';
import '../../utils/responsive.dart';
import 'widgets/timer_display.dart';
import 'widgets/chat_overlay.dart';
import 'widgets/slide_bid.dart';
import 'widgets/static_noise_overlay.dart';
import 'widgets/live_view/live_view_widget.dart';

class BuyerLiveScreen extends StatefulWidget {
  const BuyerLiveScreen({
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
  State<BuyerLiveScreen> createState() => _BuyerLiveScreenState();
}

class _BuyerLiveScreenState extends State<BuyerLiveScreen> {
  late final String _liveUrl;
  Auction? _auction;
  final List<ChatMessage> _messages = [];
  final List<StreamSubscription> _subs = [];
  final TextEditingController _chatCtrl = TextEditingController();
  final FocusNode _chatFocus = FocusNode();

  int _viewerCount = 0;
  bool _auctionEnded = false;
  bool _isMuted = false;
  bool _isFollowing = false;
  bool _chatFocused = false;
  bool _streamLost = false;
  String? _winnerName;
  int? _winnerPrice;

  // estimated heights for bottom panel (without safe area)
  static const double _panelH = 172.0;
  static const double _chatBarH = 56.0;

  @override
  void initState() {
    super.initState();
    _auction = widget.live.currentAuction;
    _liveUrl = _buildLiveUrl();
    _subscribeSocket();
    _chatFocus.addListener(() {
      if (mounted) setState(() => _chatFocused = _chatFocus.hasFocus);
    });
  }

  String _buildLiveUrl() {
    return '${AppConfig.baseUrl}/live/live-buyer.html'
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
      });
    }));

    _subs.add(socket.onAuctionEnded.listen((data) {
      if (!mounted) return;
      setState(() {
        _auctionEnded = true;
        _winnerName = data['winnerName'] as String?;
        _winnerPrice = (data['price'] as num?)?.toInt();
        _auction = _auction?.copyWith(status: 'ended');
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
    SocketService().bid(widget.live.id, auction.id, auction.currentPrice + 1000, widget.user.id, widget.user.name);
  }

  void _onSendChat() {
    final text = _chatCtrl.text.trim();
    if (text.isEmpty) return;
    SocketService().sendChat(widget.live.id, widget.user.id, text, userName: widget.user.name);
    _chatCtrl.clear();
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _chatCtrl.dispose();
    _chatFocus.dispose();
    super.dispose();
  }

  String _fmt(int p) => p
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: false,
      body: ResponsiveLayout(
        mobile: _buildMobile(context),
        tablet: _buildWide(context),
        desktop: _buildWide(context),
      ),
    );
  }

  // ─── Mobile (current full-screen overlays) ──────────────────────────────────
  Widget _buildMobile(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    final safeBottom = MediaQuery.of(context).padding.bottom;
    final isAuctionLive = _auction?.status == 'live';
    final totalBottomH = (isAuctionLive ? _panelH : 0) + _chatBarH + safeBottom;

    return Stack(
      children: [
        // L0: WebView/iframe fullscreen
        Positioned.fill(
          child: LiveViewWidget(url: _liveUrl, onMessage: _onWebViewMessage),
        ),

        // L0-1: Stream lost noise overlay
        if (_streamLost) const Positioned.fill(child: StaticNoiseOverlay()),

        // L1: Top gradient + seller info + action chips
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: _TopBar(
            sellerId: widget.live.sellerId,
            productName: _auction?.productName ?? widget.live.title,
            viewerCount: _viewerCount,
            isMuted: _isMuted,
            isFollowing: _isFollowing,
            onMuteTap: () => setState(() => _isMuted = !_isMuted),
            onFollowTap: () => setState(() => _isFollowing = !_isFollowing),
            onClose: () => Navigator.of(context).pop(),
          ),
        ),

        // L2: Chat + top bidder (above bottom panel)
        if (!_streamLost)
          Positioned(
            left: 0,
            right: 0,
            bottom: kb + totalBottomH + 4,
            height: 200,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Align(
                    alignment: Alignment.bottomLeft,
                    child: SizedBox(
                      width: MediaQuery.of(context).size.width * 0.72,
                      child: ChatOverlay(messages: _messages),
                    ),
                  ),
                ),
                if (isAuctionLive && _auction?.topBidder != null) _topBidderPill(),
              ],
            ),
          ),

        // L3: Chat input (always) + bid section (live only)
        if (!_streamLost)
          Positioned(
            bottom: kb,
            left: 0,
            right: 0,
            child: _BottomPanel(
              auction: _auction,
              auctionLive: isAuctionLive,
              safeBottom: safeBottom,
              chatFocused: _chatFocused,
              chatCtrl: _chatCtrl,
              chatFocus: _chatFocus,
              onBid: _onBid,
              onSendChat: _onSendChat,
              fmt: _fmt,
            ),
          ),

        // L4: Auction ended overlay
        if (_auctionEnded) Positioned.fill(child: _buildEndedOverlay()),
      ],
    );
  }

  // ─── Tablet/Desktop (split: video left, chat/bid right) ─────────────────────
  Widget _buildWide(BuildContext context) {
    final sidePanelWidth = context.isDesktop ? 400.0 : 340.0;

    return Row(
      children: [
        // Left: live video fullscreen + top bar overlay
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
                child: _TopBar(
                  sellerId: widget.live.sellerId,
                  productName: _auction?.productName ?? widget.live.title,
                  viewerCount: _viewerCount,
                  isMuted: _isMuted,
                  isFollowing: _isFollowing,
                  onMuteTap: () => setState(() => _isMuted = !_isMuted),
                  onFollowTap: () =>
                      setState(() => _isFollowing = !_isFollowing),
                  onClose: () => Navigator.of(context).pop(),
                ),
              ),
              if (_auctionEnded) Positioned.fill(child: _buildEndedOverlay()),
            ],
          ),
        ),
        // Right: chat + product info + bid button
        Container(
          width: sidePanelWidth,
          color: AppColors.surface,
          child: SafeArea(
            left: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_auction?.status == 'live' && _auction?.topBidder != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                    child: _topBidderPill(),
                  ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: ChatOverlay(messages: _messages),
                  ),
                ),
                if (!_streamLost)
                  _BottomPanel(
                    auction: _auction,
                    auctionLive: _auction?.status == 'live',
                    safeBottom: 0,
                    chatFocused: false,
                    chatCtrl: _chatCtrl,
                    chatFocus: _chatFocus,
                    onBid: _onBid,
                    onSendChat: _onSendChat,
                    fmt: _fmt,
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEndedOverlay() {
    return Container(
      color: Colors.black54,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.gavel, color: Colors.white, size: 48),
            const SizedBox(height: 16),
            const Text('경매 종료', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (_winnerName != null)
              Text('낙찰자: $_winnerName', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
            if (_winnerPrice != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('낙찰금액: ${_fmt(_winnerPrice!)}원', style: const TextStyle(color: Colors.white70, fontSize: 14)),
              ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.live,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('나가기', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topBidderPill() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(12),
          ),
          child: RichText(
            text: TextSpan(
              children: [
                const TextSpan(
                  text: '현재 최고가  ',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
                TextSpan(
                  text: _auction?.topBidder ?? '',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.sellerId,
    required this.productName,
    required this.viewerCount,
    required this.isMuted,
    required this.isFollowing,
    required this.onMuteTap,
    required this.onFollowTap,
    required this.onClose,
  });

  final String sellerId;
  final String productName;
  final int viewerCount;
  final bool isMuted;
  final bool isFollowing;
  final VoidCallback onMuteTap;
  final VoidCallback onFollowTap;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xCC000000), Colors.transparent],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Seller info row
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Avatar circle
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.grey[700],
                      border: Border.all(color: Colors.white38, width: 1.5),
                    ),
                    child: const Icon(Icons.person,
                        color: Colors.white54, size: 24),
                  ),
                  const SizedBox(width: 8),
                  // Seller name + subtitle
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white24,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                '판매자',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              sellerId,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                shadows: [Shadow(blurRadius: 4)],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 1),
                        Text(
                          productName,
                          style: const TextStyle(
                              color: Colors.white60, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  // LIVE + viewer count + close
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.live,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'LIVE',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.visibility,
                          color: Colors.white60, size: 13),
                      const SizedBox(width: 2),
                      Text(
                        viewerCount > 0 ? '$viewerCount' : '-',
                        style: const TextStyle(
                            color: Colors.white60, fontSize: 13),
                      ),
                      const SizedBox(width: 10),
                      GestureDetector(
                        onTap: onClose,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: Colors.black45,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Icon(Icons.close,
                              color: Colors.white, size: 20),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              // Action chips: mute / follow / coin
              Row(
                children: [
                  _ActionChip(
                    label: isMuted ? '소리켜기' : '소리끄기',
                    onTap: onMuteTap,
                  ),
                  const SizedBox(width: 8),
                  _ActionChip(
                    label: isFollowing ? '팔로잉' : '팔로우',
                    onTap: onFollowTap,
                    active: isFollowing,
                  ),
                  const SizedBox(width: 8),
                  const _CoinChip(amount: 0),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Bottom Panel ─────────────────────────────────────────────────────────────

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({
    required this.auction,
    required this.auctionLive,
    required this.safeBottom,
    required this.chatFocused,
    required this.chatCtrl,
    required this.chatFocus,
    required this.onBid,
    required this.onSendChat,
    required this.fmt,
  });

  final Auction? auction;
  final bool auctionLive;
  final double safeBottom;
  final bool chatFocused;
  final TextEditingController chatCtrl;
  final FocusNode chatFocus;
  final VoidCallback onBid;
  final VoidCallback onSendChat;
  final String Function(int) fmt;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Product info + bid (only when auction is live, hidden when keyboard is open)
        if (auction != null && auctionLive && !chatFocused)
          Container(
            color: const Color(0xD9000000),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Sale type tag + timer
                Row(
                  children: [
                    const _SaleTypeChip(label: '일반 경매', selected: true),
                    if (auction!.timeLeft != null) ...[
                      const SizedBox(width: 8),
                      TimerDisplay(timeLeft: auction!.timeLeft!),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                // Product row
                Row(
                  children: [
                    Container(
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                        color: Colors.grey[850],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.image,
                          color: Colors.white24, size: 28),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            auction!.productName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const Text(
                            '+ 배송비 별도',
                            style: TextStyle(
                                color: Colors.white38, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${fmt(auction!.currentPrice)}원',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          '시작가 ${fmt(auction!.startPrice)}원',
                          style: const TextStyle(
                              color: Colors.white38, fontSize: 10),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SlideBid(
                  amount: auction!.currentPrice + 1000,
                  onConfirm: onBid,
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        // Chat input bar
        Container(
          color: const Color(0xEB000000),
          padding: EdgeInsets.fromLTRB(12, 8, 12, safeBottom + 8),
          child: Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white10,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: TextField(
                    controller: chatCtrl,
                    focusNode: chatFocus,
                    style:
                        const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: const InputDecoration(
                      hintText: '메시지 입력',
                      hintStyle:
                          TextStyle(color: Colors.white38, fontSize: 14),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                    ),
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSendChat(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _IconBtn(
                icon: Icons.monetization_on_outlined,
                onTap: () {},
              ),
              const SizedBox(width: 6),
              _IconBtn(
                icon: Icons.send_rounded,
                onTap: onSendChat,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Small reusable widgets ───────────────────────────────────────────────────

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? Colors.white24 : Colors.black38,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white38),
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _CoinChip extends StatelessWidget {
  const _CoinChip({required this.amount});
  final int amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black38,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.primary),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.monetization_on,
              color: AppColors.primary, size: 14),
          const SizedBox(width: 4),
          Text(
            '$amount',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SaleTypeChip extends StatelessWidget {
  const _SaleTypeChip({required this.label, required this.selected});
  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: selected ? Colors.white24 : Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white38),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.help_outline, color: Colors.white54, size: 12),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: Colors.white10,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Icon(icon, color: Colors.white54, size: 18),
      ),
    );
  }
}
