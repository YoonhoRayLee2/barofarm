class Auction {
  final String id;
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
        sellerId: j['seller_id'].toString(),
        productName: j['product_name'] as String,
        startPrice: (j['start_price'] as num).toInt(),
        currentPrice: (j['current_price'] ?? j['start_price'] as num).toInt(),
        status: j['status'] as String,
        topBidderId: j['top_bidder_id']?.toString(),
        topBidder: j['top_bidder'] as String?,
        timeLeft: (j['time_left'] as num?)?.toInt(),
        endsAt: j['ends_at'] as String?,
        createdAt: j['created_at'] as String,
      );

  Auction copyWith({int? currentPrice, String? topBidder, int? timeLeft, String? status}) =>
      Auction(
        id: id,
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
