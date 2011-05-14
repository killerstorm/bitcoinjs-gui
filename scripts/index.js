$(function () {
	// CSS tweaks
	$('#header #nav li:last').addClass('nobg');
	$('.block_head ul').each(function() { $('li:first', this).addClass('nobg'); });
	$('button')
		.button()
		.filter('#nav_send_money')
			.button('option', 'icons', {primary: "icon-bitcoin-send"})
			.end()
	;

	// Messages
	$('.block .message').hide().append('<span class="close" title="Dismiss"></span>').fadeIn('slow');
	$('.block .message .close').hover(
		function() { $(this).addClass('hover'); },
		function() { $(this).removeClass('hover'); }
	);
	$('.block .message .close').click(function (e) {
		$(this).parent().fadeOut('slow', function() { $(this).remove(); });
	});

	// Address auto-selection
	$('#addr').focus(function (e) {
		this.select();
	}).mouseup(function (e) {
		e.preventDefault();
	});

	// Address copy-to-clipboard
	ZeroClipboard.setMoviePath('scripts/zeroclipboard/ZeroClipboard.swf');
	var addrClip = new ZeroClipboard.Client();
	addrClip.glue('addr_clip', 'wallet_active');
	var addrClipButton = $('#addr_clip');
	addrClip.addEventListener( 'mouseOver', function(client) {
		addrClipButton.addClass('ui-state-hover');
	});

	addrClip.addEventListener( 'mouseOut', function(client) {
		addrClipButton.removeClass('ui-state-hover');
	});

	addrClip.addEventListener( 'mouseDown', function(client) {
		addrClipButton.addClass('ui-state-focus');
	});

	addrClip.addEventListener( 'mouseUp', function(client) {
		addrClipButton.removeClass('ui-state-focus');
	});

	var wallet = new Bitcoin.Wallet();
	var txDb = new TransactionDatabase(); // Tx chain
	var txMem = new TransactionDatabase(); // Memory pool
	var txView = new TransactionView($('#main_tx_list'));

	txView.setDatabase(txDb);
	txView.setMemPool(txMem);
	txView.setWallet(wallet);

	if (wallet.loadLocal()) {
		$('#wallet_active').show();
		$('#wallet_init').hide();
		updateWallet();
	} else {
		$('#wallet_active').hide();
		$('#wallet_init').show();
	}

	// Once wallet is loaded, we can connect to the exit node
	var exitNode = new ExitNode('192.168.0.17', 3125, wallet, txDb, txMem, txView);

	$(exitNode).bind('blockInit blockAdd blockRevoke', function (e) {
		txView.setBlockHeight(e.height);
	});

	$(exitNode).bind('txData', function (e) {
		for (var i = 0; i < e.txs.length; i++) {
			wallet.process(e.txs[i]);
		}
		if (e.confirmed) {
			txDb.loadTransactions(e.txs);
		} else {
			txMem.loadTransactions(e.txs);
		}
		updateBalance();
	});

	$(exitNode).bind('txAdd', function (e) {
		txDb.addTransaction(e.tx);
		txMem.removeTransaction(e.tx.hash);
		updateBalance();
	});

	$(exitNode).bind('txNotify', function (e) {
		console.log('txNotify', e);
		wallet.process(e.tx);
		txMem.addTransaction(e.tx);
		updateBalance();
	});

	function createWallet() {
		wallet.initNew(function (n, total) {
			if (n >= total) {
				$("#wallet_init_status").text("");
				$('#wallet_active').show();
				$('#wallet_init').hide();
				wallet.save();
				updateWallet();
			} else {
				$("#wallet_init_status").text("Creating wallet "+n+"/"+total);
			}
		});
	}

	$('#wallet_init_create').click(function (e) {
		e.preventDefault();
		createWallet();
	});
	$('#wallet_active_recreate').click(function (e) {
		e.preventDefault();
		if (wallet.getBalance().equals(BigInteger.ZERO) || prompt("WARNING: This action will make the application forget your current wallet. Unless you have the wallet backed up, this is final and means your balance will be lost forever!\n\nIF YOU ARE SURE, TYPE \"YES\".") === "YES") {
			wallet.clear();
			createWallet();
		}
	});

	$('#wallet_active .new_addr').click(function (e) {
		e.preventDefault();
		var addr = wallet.getNextAddress().toString();
		$('#addr').val(addr);
		addrClip.setText(addr);
		addrClip.reposition();
	});

	function updateWallet() {
		var addr = wallet.getCurAddress().toString();
		$('#addr').val(addr);
		addrClip.setText(addr);
		addrClip.reposition();
	};

	function updateBalance() {
		$('#wallet_active .balance .value').text(Bitcoin.Util.formatValue(wallet.getBalance()));
	};
	/*
	function updateTransactions() {
		var addresses = wallet.getAllAddresses();
		$.get('/pubkeys/register', {keys: addresses.join(',')}, function (data) {
			$.get('/pubkeys/gettxs', {handle: data.handle}, function (data) {
				for (var i = 0; i < data.txs.length; i++) {
					wallet.process(data.txs[i]);
				}
				txDb.parseChainData(data);
				$('#wallet_active .balance .value').text(Bitcoin.Util.formatValue(wallet.getBalance()));
			}, 'json');
		});
	};
	*/

	// Send Money Dialog
	var sendDialog = $('#dialog_send_money').dialog({
		autoOpen: false,
		minWidth: 550,
		resizable: false
	});
	sendDialog.find('.amount').autoNumeric({
		aSign: "BTC ",
		mDec: 8,
		aPad: 2
	});
	$('#nav_send_money').click(function (e) {
		e.preventDefault();
		sendDialog.dialog('open');
		sendDialog.find('.entry').show();
		sendDialog.find('.confirm, .loading').hide();
		sendDialog.find('.amount').val('BTC ').focus();
		sendDialog.find('.address').val('');
		sendDialog.find('.messages').empty();
	});
	sendDialog.find('.cancel').click(function (e) {
		e.preventDefault();
		sendDialog.dialog('close');
	});
	sendDialog.find('.cancel_confirm').click(function (e) {
		e.preventDefault();
		sendDialog.find('.entry').show();
		sendDialog.find('.confirm, .loading').hide();
	});
	sendDialog.find('.send').click(function (e) {
		e.preventDefault();
		var msgHub = sendDialog.find('.messages');
		msgHub.empty();

		function validateError(msg) {
			var msgObj = Message.create(msg, "error");
			msgObj.appendTo(msgHub);
		};

		// Safe conversion from double to BigInteger
		var valueString = ""+$.fn.autoNumeric.Strip("dialog_send_money_amount");
		if (!valueString) {
			validateError("Please enter an amount.");
			return;
		}
		var valueComp = valueString.split('.');
		var integralPart = valueComp[0];
		var fractionalPart = valueComp[1] || "0";
		while (fractionalPart.length < 8) fractionalPart += "0";
		fractionalPart = fractionalPart.replace(/^0+/g, '');
		var value = BigInteger.valueOf(parseInt(integralPart));
		value = value.multiply(BigInteger.valueOf(100000000));
		value = value.add(BigInteger.valueOf(parseInt(fractionalPart)));
		if (value.compareTo(BigInteger.ZERO) <= 0) {
			validateError("Please enter a positive amount of Bitcoins.");
			return;
		}

		if (value.compareTo(wallet.getBalance()) > 0) {
			validateError("You have insufficient funds for this transaction.");
			return;
		}

		var rcpt = sendDialog.find('.address').val();

		// Trim address
		rcpt = rcpt.replace(/^\s+/, "").replace(/\s+$/, "");

		if (!rcpt.length) {
			validateError("Please enter the Bitcoin address of the recipient.");
			return;
		}

		try {
			var pubKeyHash = Bitcoin.Address.decodeString(rcpt);
		} catch (e) {
			validateError("Bitcoin address invalid, please double-check.");
			return;
		}

		sendDialog.find('.confirm_amount').text(Bitcoin.Util.formatValue(value)+' BTC');
		sendDialog.find('.confirm_address').text(rcpt);

		sendDialog.find('.confirm').show();
		sendDialog.find('.entry, .loading').hide();

		var confirmButton = sendDialog.find('.confirm_send');
		confirmButton.unbind('click');
		confirmButton.click(function () {
			var tx = wallet.createSend(new Bitcoin.Address(rcpt), value);
			var txBase64 = Crypto.util.bytesToBase64(tx.serialize());

			sendDialog.find('.loading').show();
			sendDialog.find('.entry, .confirm').hide();

			sendDialog.find('.loading p').text("Sending coins...");

			var txHash = Crypto.util.bytesToBase64(tx.getHash());
			$(exitNode).bind('txNotify', function (e) {
				if (e.tx.hash == txHash) {
					// Our transaction
					sendDialog.dialog('close');
					$(exitNode).unbind('txNotify', arguments.callee);
				}
			});

			$.get('/tx/send', {tx: txBase64}, function (data) {
				if (data.error) {
					validateError("Error sending transaction: " +
								  data.error.message);
					return;
				}
				sendDialog.find('.loading p').text("Awaiting reply...");
			}, 'json');
		});
	});

	// Transaction Viewer Dialog
	var al = $('#address_load').dialog({ autoOpen: false, minWidth: 500 });
	$('#address_load_open, #address_load_reset').click(function () {
		al.find('.progress, .result').hide();
		al.find('.query').show();
		$('#address_load').dialog('open');
	});
	$('#address_load_start').click(function () {
		al.find('.query, .result').hide();
		al.find('.progress').show().text('Loading transactions...');
		var addresses = $('#addresses').val().split("\n").join(",");
		$.get('/pubkeys/register', {keys: addresses}, function (data) {
			if (data.error) {
				// TODO: handle
				return;
			}
			$.get('/pubkeys/gettxs', {handle: data.handle}, function (data) {
				if (data.error) {
					// TODO: handle
					return;
				}
				var hashes = [];
				for (var i = 0; i < data.txs.length; i++) {
					hashes.push(data.txs[i].hash);
				}
				al.find('.query, .progress').hide();
				var transactionDb = new TransactionDatabase();
				var transactionView = new TransactionView(al.find('.result').show().find('.txs'));
				transactionView.setDatabase(transactionDb);
				transactionDb.parseChainData(data);
			}, 'json');
		});
	});

	/*
	// Some testing code:
	//$('#addr').text(Bitcoin.Base58.encode(Crypto.util.hexToBytes("0090fd25b15e497f5d0986bda9f7f98c1f8c8a73f6")));
	var key = new Bitcoin.ECKey();
	key.pub = Crypto.util.hexToBytes("046a76e56adf269cb896a7af1cdb01aa4acce82881a2696bc33a04aed20c176a44ed7bfbb10b91186f1a6b680daf000f742213bb3033b56c73695f357afc768781");
	console.log(key.getBitcoinAddress().toString());

	var addr = new Bitcoin.Address('1EDdZbvAJcxoHxJq6UDQGDtEQqgoT3XK3f');
	console.log(Crypto.util.bytesToHex(addr.hash));
	console.log(addr.toString());*/
});
