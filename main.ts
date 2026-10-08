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

    // Integration time: about 103 ms
    const INTEGRATION_TIME = 0xC0

    let initialized = false


    /**
     * TCS34725の取得項目
     */
    export enum TCS34725Channel {
        //% block="赤" ariaLabel="赤"
        Red = 0,

        //% block="緑" ariaLabel="緑"
        Green = 1,

        //% block="青" ariaLabel="青"
        Blue = 2,

        //% block="明るさ" ariaLabel="明るさ"
        Clear = 3
    }


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
     * TCS34725の値を取得
     */
    //% block="カラーセンサー の $channel の値"
    //% channel.defl=カラーセンサ―Channel.Red
    //% group="カラーセンサ―"
    export function value(channel: TCS34725Channel): number {
        init()

        switch (channel) {
            case TCS34725Channel.Red:
                return read16(RDATA)

            case TCS34725Channel.Green:
                return read16(GDATA)

            case TCS34725Channel.Blue:
                return read16(BDATA)

            case TCS34725Channel.Clear:
                return read16(CDATA)

            default:
                return 0
        }
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
     *
     * true = 新しいRGBCデータあり
     * false = 変換中
     */
    //% block="TCS34725 のデータ有効"
    //% group="TCS34725 デバッグ"
    export function dataReady(): boolean {
        init()

        return (readRegister(STATUS) & 0x01) != 0
    }
}
