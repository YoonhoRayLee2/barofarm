import 'dart:async';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../app_theme.dart';
import '../../models/auction.dart';
import '../../models/message.dart';
import '../../models/user.dart';
import '../../services/socket_service.dart';
import 'widgets/live_badge.dart';
import 'widgets/timer_display.dart';
import 'widgets/chat_overlay.dart';
import 'widgets/bid_chips.dart';
import 'widgets/slide_bid.dart';

class LiveScreen extends StatefulWidget {
  const LiveScreen({
    super.key,
    required this.auction,
    required this.user,
    required this.liveToken,
    required this.serverUrl,
  });

  final Auction auction;
  final User user;
  final String liveToken;
  final String serverUrl;

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  late final WebViewController _webCtrl;
  late Auction _auction;
  final List<ChatMessage> _messages = [];
  final List<StreamSubscription> _subs = [];

  int _bidAmount = 0;
  bool _auctionEnded = false;
  bool _liveStarted = false;

  @override
  void initState() {
    super.initState();
    _auction = widget.auction;
    _bidAmount = _auction.currentPrice + 1000;

    _initWebView();
    _subscribeSocket();
  }

  void _initWebView() {
    final role = widget.user.role;
    final page = role == 'seller' ? 'live-seller.html' : 'live-buyer.html';

    // AppConfig baseUrl → replace 10.0.2.2 with server's public URL when on device
    final base = widget.serverUrl.isNotEmpty ? widget.serverUrl : 'http://10.0.2.2:3000';
    final url = '$base/live/$page'
        '?serverUrl=${Uri.encodeQueryComponent(widget.serverUrl)}'
        '&token=${Uri.encodeQueryComponent(widget.liveToken)}';

    _webCtrl = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: _onWebViewMessage,
      )
      ..loadRequest(Uri.parse(url));
  }

  void _onWebViewMessage(JavaScriptMessage msg) {
    switch (msg.message) {
      case 'onLiveStart':
        setState(() => _liveStarted = true);
      case 'onLiveEnd':
        if (mounted) Navigator.of(context).pop();
      case 'onLiveError':
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('라이브 연결에 문제가 생겼어요')),
          );
        }
    }
  }

  void _subscribeSocket() {
    final socket = SocketService();
    socket.join(_auction.id);

    _subs.add(socket.onAuctionUpdate.listen((data) {
      if (!mounted) return;
      setState(() {
        _auction = _auction.copyWith(
          currentPrice: (data['currentPrice'] as num?)?.toInt() ?? _auction.currentPrice,
          topBidder: data['topBidder'] as String?,
          timeLeft: (data['timeLeft'] as num?)?.toInt(),
          status: data['status'] as String?,
        );
        _bidAmount = _auction.currentPrice + 1000;
      });
    }));

    _subs.add(socket.onAuctionEnded.listen((data) {
      if (!mounted) return;
      setState(() => _auctionEnded = true);
    }));

    _subs.add(socket.onChatMessage.listen((msg) {
      if (!mounted) return;
      setState(() => _messages.add(msg));
    }));
  }

  void _onBid() {
    SocketService().bid(_auction.id, _bidAmount, widget.user.id);
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  String _formatPrice(int p) =>
      p.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    final isBuyer = widget.user.role == 'buyer';

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // L0: WebView — full screen live video
          Positioned.fill(
            child: WebViewWidget(controller: _webCtrl),
          ),

          // L1: top overlay — LIVE badge + product name + timer
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    const LiveBadge(),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _auction.productName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          shadows: [Shadow(blurRadius: 4)],
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (_auction.timeLeft != null)
                      TimerDisplay(timeLeft: _auction.timeLeft!),
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
                ),
              ),
            ),
          ),

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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_formatPrice(_auction.currentPrice)}원',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w700,
                    shadows: [Shadow(blurRadius: 6)],
                  ),
                ),
                if (_auction.topBidder != null)
                  Text(
                    '최고 입찰자: ${_auction.topBidder}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
              ],
            ),
          ),

          // L4: bid UI (buyer only, while auction active)
          if (isBuyer && !_auctionEnded)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                color: Colors.black45,
                padding: const EdgeInsets.only(top: 8, bottom: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    BidChips(
                      currentPrice: _auction.currentPrice,
                      onSelect: (price) => setState(() => _bidAmount = price),
                    ),
                    const SizedBox(height: 8),
                    SlideBid(
                      amount: _bidAmount,
                      onConfirm: _onBid,
                    ),
                  ],
                ),
              ),
            ),

          // Auction ended overlay
          if (_auctionEnded)
            Positioned.fill(
              child: Container(
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
                      const SizedBox(height: 8),
                      Text(
                        '최종 낙찰가: ${_formatPrice(_auction.currentPrice)}원',
                        style: const TextStyle(color: Colors.white70, fontSize: 16),
                      ),
                      if (_auction.topBidder != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            '낙찰자: ${_auction.topBidder}',
                            style: const TextStyle(color: Colors.white70, fontSize: 14),
                          ),
                        ),
                      const SizedBox(height: 32),
                      ElevatedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.accent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text('나가기', style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
