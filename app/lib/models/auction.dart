class Auction {
  final String id;
  final String liveId;
  final String sellerId;
  final String productName;
  final int startPrice;
  final int currentPrice;
  final String status; // 'pending' | 'live' | 'ended'
  final String? topBidderId;
  final String? topBidder;
  final int? timeLeft;
  final String? endsAt;
  final String createdAt;

  const Auction({
    required this.id,
    required this.liveId,
    required this.sellerId,
    required this.productName,
    required this.startPrice,
    required this.currentPrice,
    required this.status,
    this.topBidderId,
    this.topBidder,
    this.timeLeft,
    this.endsAt,
    required this.createdAt,
  });

  factory Auction.fromJson(Map<String, dynamic> j) => Auction(
        id: j['id'].toString(),
        liveId: j['liveId']?.toString() ?? '',
        sellerId: (j['seller_id'] ?? j['sellerId']).toString(),
        productName: (j['product_name'] ?? j['productName']) as String,
        startPrice: ((j['start_price'] ?? j['startPrice']) as num).toInt(),
        currentPrice:
            ((j['current_price'] ?? j['currentPrice'] ?? j['start_price'] ?? j['startPrice']) as num).toInt(),
        status: j['status'] as String,
        topBidderId: j['top_bidder_id']?.toString(),
        // memState는 camelCase topBidder, DB는 top_bidder 컬럼이 없으므로 camelCase 우선
        topBidder: (j['topBidder'] ?? j['top_bidder']) as String?,
        // memState는 camelCase timeLeft, DB에는 time_left 컬럼 없음
        timeLeft: ((j['timeLeft'] ?? j['time_left']) as num?)?.toInt(),
        endsAt: j['ends_at'] as String?,
        createdAt: j['created_at'] as String,
      );

  Auction copyWith({String? liveId, int? currentPrice, String? topBidder, int? timeLeft, String? status}) =>
      Auction(
        id: id,
        liveId: liveId ?? this.liveId,
        sellerId: sellerId,
        productName: productName,
        startPrice: startPrice,
        currentPrice: currentPrice ?? this.currentPrice,
        status: status ?? this.status,
        topBidderId: topBidderId,
        topBidder: topBidder ?? this.topBidder,
        timeLeft: timeLeft ?? this.timeLeft,
        endsAt: endsAt,
        createdAt: createdAt,
      );
}
