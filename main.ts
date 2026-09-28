/**
 * TEDIS for Maqueen
 * TCS34725 Color Sensor
 */

//% color="#8B4513" icon="\uf1fb" block="TEDIS"
namespace tedis {

    const TCS34725_ADDRESS = 0x29

    // TCS34725 registers
    const ENABLE = 0x00
    const ATIME = 0x01
    const CONTROL = 0x0F
    const ID = 0x12
    const STATUS = 0x13

    const CDATA = 0x14
    const RDATA = 0x16
    const GDATA = 0x18
    const BDATA = 0x1A

    // Integration time: 101.2 ms
    // 256 - 0xD5 = 43 counts × 2.4 ms = 103.2 ms
    const INTEGRATION_TIME = 0xD5

    let initialized = false

    /**
     * Write one byte to a TCS34725 register.
     */
    function writeRegister(register: number, value: number): void {
        pins.i2cWriteBuffer(
            TCS34725_ADDRESS,
            pins.createBufferFromArray([
                0x80 | (register & 0x1F),
                value & 0xFF
            ])
        )
    }

    /**
     * Read one byte from a TCS34725 register.
     */
    function readRegister(register: number): number {
        pins.i2cWriteNumber(
            TCS34725_ADDRESS,
            0x80 | (register & 0x1F),
            NumberFormat.UInt8BE,
            false
        )

        return pins.i2cReadNumber(
            TCS34725_ADDRESS,
            NumberFormat.UInt8BE,
            false
        )
    }

    /**
     * Read a 16-bit value from two consecutive registers.
     * TCS34725 stores low byte first.
     */
    function read16(register: number): number {
        pins.i2cWriteNumber(
            TCS34725_ADDRESS,
            0xA0 | (register & 0x1F),
            NumberFormat.UInt8BE,
            false
        )

        const data = pins.i2cReadBuffer(
            TCS34725_ADDRESS,
            2
        )

        return data[0] | (data[1] << 8)
    }

    /**
     * Initialize TCS34725.
     */
    function init(): void {
        if (initialized) {
            return
        }

        // Integration time = about 103 ms
        writeRegister(ATIME, INTEGRATION_TIME)

        // Gain = 1x
        writeRegister(CONTROL, 0x00)

        // Power ON
        writeRegister(ENABLE, 0x01)

        basic.pause(3)

        // Power ON + RGBC ADC enable
        writeRegister(ENABLE, 0x03)

        // Wait for first conversion
        basic.pause(110)

        initialized = true
    }

    /**
     * TCS34725のClear値
     */
    //% block="TCS34725 の明るさ"
    //% group="TCS34725"
    export function clear(): number {
        init()
        return read16(CDATA)
    }

    /**
     * TCS34725の赤の生データ
     */
    //% block="TCS34725 の赤"
    //% group="TCS34725"
    export function red(): number {
        init()
        return read16(RDATA)
    }

    /**
     * TCS34725の緑の生データ
     */
    //% block="TCS34725 の緑"
    //% group="TCS34725"
    export function green(): number {
        init()
        return read16(GDATA)
    }

    /**
     * TCS34725の青の生データ
     */
    //% block="TCS34725 の青"
    //% group="TCS34725"
    export function blue(): number {
        init()
        return read16(BDATA)
    }

    /**
     * TCS34725のID
     * センサー確認用
     */
    //% block="TCS34725 のID"
    //% group="TCS34725 デバッグ"
    export function sensorID(): number {
        return readRegister(ID)
    }

    /**
     * TCS34725のデータ有効状態
     * 1 = 新しいRGBCデータあり
     * 0 = 変換中
     */
    //% block="TCS34725 のデータ有効"
    //% group="TCS34725 デバッグ"
    export function dataReady(): boolean {
        init()
        return (readRegister(STATUS) & 0x01) != 0
    }
}
