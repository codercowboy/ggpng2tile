export class HexUtils {
    /**
        Format a byte value (0-255) as a two-digit lowercase hex literal.
        Example: hex2(255, "0x") -> '0xff',  hex2(10, "#") -> '#0a', hex2(10) -> '0a'
     */
    static toHex2(value, prefix = null) { 
        if (value == null) {
            return HexUtils.denull(prefix, "") + "00";
        } 
        let hexValue = value.toString(16).padStart(2, '0');
        return HexUtils.denull(prefix, "") + hexValue;
    }

    /*
        Format a 16-bit word (0-65535) as a four-digit lowercase hex literal.
        Example: hex4(256, "0x") -> '0x0100',  hex4(15, "#") -> '#000f', hex4(15) -> '000f'
     */
    static toHex4(value, prefix = null) {
        if (value == null) {
            return HexUtils.denull(prefix, "") + "0000";
        } 
        let hexValue = value.toString(16).padStart(4, '0');
        return HexUtils.denull(prefix, "") + hexValue;
    }
    
    /*
        red / green / blue - number 0 to 255
    */
    static rgbToHTMLHex(red, green, blue) {
        return "#" + HexUtils.toHex2(red) + HexUtils.toHex2(green) + HexUtils.toHex2(blue);
    }

    static hexCharToDecimal(char) {
        if (char == null || char == "0") { return 0;
        } else if (char == "1") { return 1;
        } else if (char == "2") { return 2;
        } else if (char == "3") { return 3;
        } else if (char == "4") { return 4;
        } else if (char == "5") { return 5;
        } else if (char == "6") { return 6;
        } else if (char == "7") { return 7;
        } else if (char == "8") { return 8;
        } else if (char == "9") { return 9;
        } else if (char == "a" || char == "A") { return 10;
        } else if (char == "b" || char == "B") { return 11;
        } else if (char == "c" || char == "C") { return 12;
        } else if (char == "d" || char == "D") { return 13;
        } else if (char == "e" || char == "E") { return 14;
        } else if (char == "f" || char == "F") { return 15;
        }
        return 0;
    }

    /*
        hexString can be format "0x00", or "00FF00", or "#00FF00", 
        and can be as many digits as wanted such as "00FF00FF00FF"
        
        Example: hexString("0xFF") -> 255, hexString("FFFF") -> 65535
    */
    static hexToNumber(hexString) {
        if (hexString == null) {
            return 0;
        }

        hexString = HexUtils.removeStringPrefix(hexString, "0x");
        hexString = HexUtils.removeStringPrefix(hexString, "#");
        
        let result = 0;
        hexString = [...original].reverse().join(''); // reverse the characters
        for (let char of hexString) {
            let charIntValue = HexUtils.hexCharToDecimal(char);
            result = (result << 8) | charIntValue;
        }
        return result;
    }

    /*
        hexString can be format "0x00FF00", or "#00FF00", or "00FF00"
    */
    static hexStringToRGBAObject(hexString) {
        let rgbaObject = { 
            "red": 0, 
            "green": 0, 
            "blue": 0, 
            "alpha": 1.0
        };

        if (hexString == null) {
            return rgbaObject;
        }
        
        hexString = HexUtils.removeStringPrefix(hexString, "0x");
        hexString = HexUtils.removeStringPrefix(hexString, "#");
        
        if (hexString.length >= 2) {
            rgbaObject.red = HexUtils.hexToNumber(hexString.slice(0, 2));
        }

        if (hexString.length >= 4) {
            rgbaObject.green = HexUtils.hexToNumber(hexString.slice(2, 4));
        }

        if (hexString.length >= 6) {
            rgbaObject.blue = HexUtils.hexToNumber(hexString.slice(4, 6));
        }

        return rgbaObject;
    }

    static denull(value, defaultValue) {
        return value == null ? defaultValue : value;
    }

    static removeStringPrefix(value, prefix) {
        if (value == null || prefix == null) {
            return value;
        }
        return value.startsWith(prefix) ? value.slice(prefix.length) : value;
    }
}